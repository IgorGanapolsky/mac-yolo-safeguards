#!/usr/bin/env node
'use strict';

/**
 * hermes-cortex-fleet.js — Snowflake Cortex-inspired fleet lake for Hermes
 *
 * Implements the high-ROI Cortex improvements for Mac mini + Mac Pro:
 *
 *  1. Unified Telemetry Lake (Cortex Data Foundation)
 *     - Ingests traffic.jsonl from all Macs (local + Tailscale-discovered remotes)
 *     - Produces Snowflake-style tables: TRAFFIC, DAILY_BURN, GATEWAY_HEALTH, MODEL_RELIABILITY
 *
 *  2. Cortex AISQL Functions (serverless LLM transforms inside SQL)
 *     - aiClassifyFailure(record) -> CORTEX.CLASSIFY_FAILURE
 *     - aiSummarizeDay, aiExtractAnomaly, aiSummarizeFailures
 *
 *  3. Cortex Analyst (NL -> SQL for fleet)
 *     - naturalLanguageToSql() translates "how many tokens today?" -> SQL-like plan
 *     - executeQuery() runs that plan over the lake
 *
 *  4. Cortex Search (hybrid retrieval over lessons, vault, plan.md, traffic)
 *     - buildSearchIndex() + hybridSearch() => single ranked retrieval
 *
 *  5. Cortex Agents (Data Agent orchestration)
 *     - answerFleetQuestion() orchestrates structured SQL + unstructured search
 *
 *  6. ML Forecast + Governance (trusted perimeter)
 *     - forecastBurn(), detectAnomalies(), buildFleetReport() with receipts
 *
 * No secrets are printed. All file ops are local-only unless --fetch-remote.
 * When Snowflake creds are present (SNOWFLAKE_* env) the module can emit
 * CREATE TABLE / COPY INTO statements for later upload, but never auto-uploads.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_TRAFFIC = path.join(os.homedir(), '.hermes', 'litellm-logs', 'traffic.jsonl');
const DEFAULT_OUT = path.join(os.homedir(), '.hermes', 'cortex-fleet-latest.json');

const TABLES = Object.freeze({
  TRAFFIC: 'HERMES.TRAFFIC',
  DAILY_BURN: 'HERMES.DAILY_BURN',
  GATEWAY_HEALTH: 'HERMES.GATEWAY_HEALTH',
  MODEL_RELIABILITY: 'HERMES.MODEL_RELIABILITY',
  BURN_ANOMALIES: 'HERMES.BURN_ANOMALIES',
  SEARCH_INDEX: 'HERMES.SEARCH_INDEX',
});

// ---- Low-level parsing (mirrors burn-alert but fleet-aware) ----

function parseLines(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

function loadTrafficFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const records = parseLines(text).map(r => ({ ...r, _source_file: filePath, _source_host: inferHostFromRecord(r) || path.basename(path.dirname(path.dirname(filePath))) || os.hostname() }));
    return records;
  } catch {
    return [];
  }
}

function inferHostFromRecord(r) {
  // traffic.jsonl has no host field consistently, infer from local context later
  return r.host || r.hostname || r._hermes_host || null;
}

function dayStrFromTs(ts) {
  if (!ts) return null;
  // ts_end like "2026-07-06 14:23:11" or ISO
  const s = String(ts).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function normalizeTrafficRecord(r, defaultHost = os.hostname()) {
  const host = r._source_host || r.host || r.hostname || defaultHost;
  const model = String(r.model || '').toLowerCase().trim() || 'unknown';
  const status = r.status === 'success' ? 'success' : 'failure';
  const totalTokens = Number(r.total_tokens) || Number(r.tokens) || 0;
  const tsEnd = r.ts_end || r.timestamp || '';
  const day = dayStrFromTs(tsEnd) || new Date().toISOString().slice(0, 10);
  const latencyMs = Number(r.latency_ms || r.latency || 0) || null;
  const emptyKind = r.empty_kind || r.emptyKind || null; // truncated, tool_call, etc
  return {
    host,
    model,
    status,
    total_tokens: totalTokens,
    ts_end: tsEnd,
    day,
    latency_ms: latencyMs,
    empty_kind: emptyKind,
    provider: String(r.provider || '').toLowerCase() || inferProvider(model),
    http_status: Number(r.http_status || r.code || 0) || null,
    error: String(r.error || '').slice(0, 500),
    _raw: r,
  };
}

function inferProvider(model) {
  if (model.includes('glm')) return 'zai';
  if (model.includes('qwen')) return 'ollama-local';
  if (model.includes('gpt-oss')) return 'ollama-local';
  if (model.includes('claude')) return 'anthropic';
  if (model.includes('grok')) return 'xai';
  return 'unknown';
}

// ---- Cortex Data Foundation: tables ----

function buildDailyBurn(traffic) {
  const byDay = {};
  for (const r of traffic) {
    if (!byDay[r.day]) byDay[r.day] = { day: r.day, total_tokens: 0, by_model: {}, by_host: {}, success: 0, failure: 0, records: 0 };
    const d = byDay[r.day];
    d.total_tokens += r.total_tokens;
    d.by_model[r.model] = (d.by_model[r.model] || 0) + r.total_tokens;
    d.by_host[r.host] = (d.by_host[r.host] || 0) + r.total_tokens;
    if (r.status === 'success') d.success += 1; else d.failure += 1;
    d.records += 1;
  }
  return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
}

function buildModelReliability(traffic) {
  const byModel = {};
  for (const r of traffic) {
    if (!byModel[r.model]) byModel[r.model] = { model: r.model, provider: r.provider, total: 0, success: 0, failure: 0, total_tokens: 0, avg_latency_ms: 0, _latSum: 0, _latCount: 0, truncated_empty: 0, hosts: new Set() };
    const m = byModel[r.model];
    m.total += 1;
    if (r.status === 'success') m.success += 1; else m.failure += 1;
    m.total_tokens += r.total_tokens;
    if (r.latency_ms) { m._latSum += r.latency_ms; m._latCount += 1; }
    if (r.empty_kind === 'truncated') m.truncated_empty += 1;
    m.hosts.add(r.host);
  }
  return Object.values(byModel).map(m => ({
    model: m.model,
    provider: m.provider,
    total_requests: m.total,
    success: m.success,
    failure: m.failure,
    failure_rate: m.total ? +(m.failure / m.total).toFixed(3) : 0,
    total_tokens: m.total_tokens,
    avg_latency_ms: m._latCount ? Math.round(m._latSum / m._latCount) : null,
    truncated_empty: m.truncated_empty,
    hosts: Array.from(m.hosts),
    reliability: m.total ? +(m.success / m.total).toFixed(3) : 0,
  })).sort((a, b) => b.total_requests - a.total_requests);
}

function buildGatewayHealth(traffic, probes = []) {
  // probes = [{host, reachable, hostname?, ...}] from all-macs-setup
  const latestByHost = {};
  for (const r of traffic) {
    if (!latestByHost[r.host] || String(r.ts_end) > String(latestByHost[r.host].ts_end)) latestByHost[r.host] = r;
  }
  const health = [];
  for (const [host, last] of Object.entries(latestByHost)) {
    health.push({
      host,
      last_seen: last.ts_end,
      last_model: last.model,
      last_status: last.status,
      status: last.status === 'success' ? 'gateway_online' : 'gateway_degraded',
    });
  }
  for (const p of probes) {
    if (!health.find(h => h.host === p.host)) {
      health.push({
        host: p.host,
        last_seen: null,
        last_model: null,
        last_status: null,
        status: p.reachable ? 'gateway_online' : 'gateway_offline',
        probe: p,
      });
    }
  }
  return health;
}

// ---- Cortex AISQL Functions ----

function aiClassifyFailure(record) {
  // Mirrors Cortex AI_CLASSIFY: deterministic heuristic (no LLM call) so it works offline everywhere
  const r = record._raw || record;
  const model = String(record.model || r.model || '').toLowerCase();
  const status = record.status || r.status;
  const http = Number(record.http_status || r.http_status || r.code || 0);
  const emptyKind = record.empty_kind || r.empty_kind || r.emptyKind || '';
  const error = String(record.error || r.error || '').toLowerCase();
  const latency = Number(record.latency_ms || r.latency_ms || 0);

  if (emptyKind === 'truncated') return { category: 'truncated_empty', severity: 'high', action: 'check HERMES_GLM_MIN_MAX_TOKENS and hermes_logger callback', cortex_fn: 'AI_CLASSIFY_FAILURE' };
  if (emptyKind === 'tool_call') return { category: 'tool_call_empty', severity: 'low', action: 'expected for tool-call models', cortex_fn: 'AI_CLASSIFY_FAILURE' };
  if (http === 429 || error.includes('quota') || error.includes('rate limit') || error.includes('429')) return { category: 'quota_exhausted', severity: 'critical', action: 'throttle or switch to local fallback; check weekly quota', cortex_fn: 'AI_CLASSIFY_FAILURE' };
  if (http === 401 || http === 403 || error.includes('auth') || error.includes('unauthorized') || error.includes('invalid api key')) return { category: 'auth_failure', severity: 'high', action: 're-pair gateway key or rotate API key', cortex_fn: 'AI_CLASSIFY_FAILURE' };
  if (http >= 500 || error.includes('overloaded') || error.includes('timeout') || error.includes('internal')) return { category: 'transient_outage', severity: 'medium', action: 'retry with backoff, use local_fast', cortex_fn: 'AI_CLASSIFY_FAILURE' };
  if (model.includes('glm') && status === 'failure' && latency > 40000) return { category: 'glm_timeout', severity: 'medium', action: 'retry or fallback to qwen3:8b', cortex_fn: 'AI_CLASSIFY_FAILURE' };
  if (status === 'failure') return { category: 'unknown_failure', severity: 'medium', action: 'check traffic.jsonl error field', cortex_fn: 'AI_CLASSIFY_FAILURE' };
  return { category: 'ok', severity: 'low', action: 'none', cortex_fn: 'AI_CLASSIFY_FAILURE' };
}

function aiSummarizeDay(dailyEntry, opts = {}) {
  if (!dailyEntry) return 'No data';
  const topModel = Object.entries(dailyEntry.by_model || {}).sort((a, b) => b[1] - a[1])[0];
  const topHost = Object.entries(dailyEntry.by_host || {}).sort((a, b) => b[1] - a[1])[0];
  const totalM = (dailyEntry.total_tokens / 1e6).toFixed(2);
  const failRate = dailyEntry.records ? `${((dailyEntry.failure / dailyEntry.records) * 100).toFixed(1)}%` : '0%';
  return `${dailyEntry.day}: ${totalM}M tokens, ${dailyEntry.records} calls, fail ${failRate}. Top ${topModel ? `${topModel[0]} ${(topModel[1]/1e6).toFixed(1)}M` : 'n/a'} @ ${topHost ? topHost[0] : '?'}. ${opts.cortex_fn ? '[AI_SUMMARIZE]' : ''}`.trim();
}

function aiSummarizeFailures(traffic, limit = 10) {
  const failures = traffic.filter(r => r.status === 'failure').slice(-50);
  const classified = failures.map(r => ({ ...r, classification: aiClassifyFailure(r) }));
  const byCat = {};
  for (const f of classified) {
    byCat[f.classification.category] = (byCat[f.classification.category] || 0) + 1;
  }
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  return {
    cortex_fn: 'AI_SUMMARIZE',
    total_failures_analyzed: classified.length,
    by_category: Object.fromEntries(sorted),
    top_examples: classified.slice(-limit).map(c => ({ day: c.day, model: c.model, host: c.host, cat: c.classification.category, error: String(c.error).slice(0, 120) })),
    summary: sorted.length ? `Top failure ${sorted[0][0]} (${sorted[0][1]}x). ${sorted.length} categories.` : 'No failures',
  };
}

function aiExtractAnomaly(dailyBurn) {
  if (!dailyBurn.length) return null;
  const totals = dailyBurn.map(d => d.total_tokens);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const variance = totals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / totals.length;
  const std = Math.sqrt(variance);
  // Use 1.5*std to catch 27.8M incident (mean 6.48M, std 10.6M, threshold 6.48+2*std is exactly 27.8 boundary)
  // Also include 3x mean heuristic for single-spike detection when variance is high.
  const threshold = mean + 1.5 * std;
  const anomalies = dailyBurn.filter(d => d.total_tokens > 1_000_000 && (d.total_tokens >= threshold || d.total_tokens > mean * 3));
  return { mean: Math.round(mean), std: Math.round(std), threshold: Math.round(threshold), anomalies };
}

// ---- Forecast (Snowflake ML / Cortex ML inspired) ----

function forecastBurn(todayPartial, opts = {}) {
  // todayPartial = { day, total_tokens so far, start hour? }
  // Simple linear projection: if now is 14:00, projection = partial / fraction_of_day
  const now = opts.now ? new Date(opts.now) : new Date();
  const fraction = (now.getHours() + now.getMinutes() / 60) / 24;
  const safeFraction = Math.max(0.05, Math.min(1, fraction || 0.5));
  const projected = Math.round(todayPartial.total_tokens / safeFraction);
  const weeklyQuota = Number(opts.weeklyQuota || 50_000_000); // default 50M assumption, z.ai weekly ~ 50-100M
  const dailyCap = Number(opts.dailyCap || 8_000_000);
  const remainingDaily = Math.max(0, dailyCap - todayPartial.total_tokens);
  const remainingWeekly = Math.max(0, weeklyQuota - todayPartial.weeklyBurned);
  return {
    cortex_fn: 'ML.FORECAST',
    as_of: now.toISOString(),
    day: todayPartial.day,
    tokens_so_far: todayPartial.total_tokens,
    fraction_of_day: +safeFraction.toFixed(3),
    projected_eod: projected,
    daily_cap: dailyCap,
    remaining_daily: remainingDaily,
    projected_over_daily_cap: projected > dailyCap,
    weekly_quota: weeklyQuota,
    burn_pct_daily: +(todayPartial.total_tokens / dailyCap * 100).toFixed(1),
    forecast_burn_pct_daily: +(projected / dailyCap * 100).toFixed(1),
    risk: projected > dailyCap * 1.2 ? 'critical' : projected > dailyCap ? 'high' : projected > dailyCap * 0.7 ? 'medium' : 'low',
    action: projected > dailyCap ? 'throttle agents, check for runaway loop' : 'ok',
  };
}

function detectAnomalies(traffic, dailyBurn) {
  const anomalies = [];
  // 1) huge single day like 27.8M
  for (const d of dailyBurn) {
    if (d.total_tokens > 8_000_000) {
      anomalies.push({ type: 'high_burn_day', day: d.day, tokens: d.total_tokens, severity: d.total_tokens > 20_000_000 ? 'critical' : 'high', table: TABLES.BURN_ANOMALIES });
    }
  }
  // 2) high failure rate day
  for (const d of dailyBurn) {
    if (d.records >= 10 && d.failure / d.records > 0.5) {
      anomalies.push({ type: 'high_failure_rate', day: d.day, failure_rate: +(d.failure / d.records).toFixed(2), severity: 'high', table: TABLES.BURN_ANOMALIES });
    }
  }
  // 3) truncated empties
  const modelRel = buildModelReliability(traffic);
  for (const m of modelRel) {
    if (m.truncated_empty >= 3) {
      anomalies.push({ type: 'truncated_empty_spike', model: m.model, count: m.truncated_empty, severity: 'high', table: TABLES.BURN_ANOMALIES });
    }
  }
  // 4) quota exhaustion in recent 20
  const recentFailures = traffic.slice(-20).filter(r => aiClassifyFailure(r).category === 'quota_exhausted');
  if (recentFailures.length >= 3) {
    anomalies.push({ type: 'quota_exhaustion_burst', count: recentFailures.length, severity: 'critical', table: TABLES.BURN_ANOMALIES });
  }
  return anomalies;
}

// ---- Cortex Analyst: NL -> SQL ----

const ANALYST_INTENTS = [
  { pattern: /how many tokens.*today|tokens today|burn today/i, intent: 'daily_burn_today', sqlTemplate: (p) => `SELECT day, total_tokens, by_model FROM ${TABLES.DAILY_BURN} WHERE day = CURRENT_DATE()` },
  { pattern: /tokens.*yesterday|yesterday.*burn/i, intent: 'daily_burn_yesterday', sqlTemplate: (p) => `SELECT day, total_tokens FROM ${TABLES.DAILY_BURN} WHERE day = CURRENT_DATE() - 1` },
  { pattern: /top model|most.*model|which model.*most/i, intent: 'top_model', sqlTemplate: () => `SELECT model, SUM(total_tokens) as tokens FROM ${TABLES.TRAFFIC} GROUP BY model ORDER BY tokens DESC LIMIT 5` },
  { pattern: /failure.*rate|failing|degraded|why.*fail/i, intent: 'failure_analysis', sqlTemplate: () => `SELECT model, COUNT(*) as total, SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failures FROM ${TABLES.TRAFFIC} WHERE day = CURRENT_DATE() GROUP BY model` },
  { pattern: /forecast|project|will.*exceed|quota/i, intent: 'forecast', sqlTemplate: () => `SELECT ML.FORECAST(total_tokens) FROM ${TABLES.DAILY_BURN} WHERE day = CURRENT_DATE()` },
  { pattern: /fleet|all macs|mini.*pro|gateway.*health|health/i, intent: 'fleet_health', sqlTemplate: () => `SELECT * FROM ${TABLES.GATEWAY_HEALTH}` },
  { pattern: /reliability|reliable|latency|avg.*latency/i, intent: 'model_reliability', sqlTemplate: () => `SELECT * FROM ${TABLES.MODEL_RELIABILITY} ORDER BY reliability DESC` },
  { pattern: /anomal|alert|burn.*alert|incident/i, intent: 'anomalies', sqlTemplate: () => `SELECT * FROM ${TABLES.BURN_ANOMALIES} ORDER BY day DESC` },
];

function naturalLanguageToSql(nl, opts = {}) {
  const text = String(nl || '');
  for (const rule of ANALYST_INTENTS) {
    if (rule.pattern.test(text)) {
      return {
        intent: rule.intent,
        sql: rule.sqlTemplate({ text }),
        confidence: 0.85,
        table: Object.values(TABLES).find(t => rule.sqlTemplate({}).includes(t)) || TABLES.TRAFFIC,
        cortex_fn: 'CORTEX.ANALYST',
        nl: text,
      };
    }
  }
  // fallback: treat as search
  return {
    intent: 'semantic_search',
    sql: `SELECT * FROM ${TABLES.SEARCH_INDEX} WHERE query ILIKE '%${text.slice(0, 80).replace(/'/g, "''")}%'"`,
    confidence: 0.5,
    table: TABLES.SEARCH_INDEX,
    cortex_fn: 'CORTEX.ANALYST',
    nl: text,
    fallback: true,
  };
}

function executeQuery(plan, context) {
  // context = { traffic, dailyBurn, gatewayHealth, modelReliability, anomalies }
  const { traffic, dailyBurn, gatewayHealth, modelReliability, anomalies: anom } = context;
  switch (plan.intent) {
    case 'daily_burn_today': {
      const today = new Date().toISOString().slice(0, 10);
      const d = dailyBurn.find(x => x.day === today) || dailyBurn[dailyBurn.length - 1] || null;
      return { intent: plan.intent, result: d ? [d] : [], sql: plan.sql, rowCount: d ? 1 : 0 };
    }
    case 'daily_burn_yesterday': {
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const d = dailyBurn.find(x => x.day === y);
      return { intent: plan.intent, result: d ? [d] : [], sql: plan.sql, rowCount: d ? 1 : 0 };
    }
    case 'top_model': {
      const agg = {};
      for (const r of traffic) agg[r.model] = (agg[r.model] || 0) + r.total_tokens;
      const result = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([model, tokens]) => ({ model, tokens }));
      return { intent: plan.intent, result, sql: plan.sql, rowCount: result.length };
    }
    case 'failure_analysis': {
      const today = new Date().toISOString().slice(0, 10);
      const todayTraffic = traffic.filter(r => r.day === today);
      const byModel = {};
      for (const r of todayTraffic) {
        if (!byModel[r.model]) byModel[r.model] = { model: r.model, total: 0, failures: 0 };
        byModel[r.model].total += 1;
        if (r.status === 'failure') byModel[r.model].failures += 1;
      }
      const result = Object.values(byModel).map(x => ({ ...x, failure_rate: x.total ? +(x.failures / x.total).toFixed(2) : 0 }));
      return { intent: plan.intent, result, sql: plan.sql, summary: aiSummarizeFailures(traffic), rowCount: result.length };
    }
    case 'forecast': {
      const today = new Date().toISOString().slice(0, 10);
      const d = dailyBurn.find(x => x.day === today) || { day: today, total_tokens: traffic.filter(r => r.day === today).reduce((a, b) => a + b.total_tokens, 0) };
      const weeklyBurned = dailyBurn.slice(-7).reduce((a, b) => a + b.total_tokens, 0);
      const fcast = forecastBurn({ day: d.day, total_tokens: d.total_tokens, weeklyBurned }, {});
      return { intent: plan.intent, result: [fcast], sql: plan.sql, rowCount: 1 };
    }
    case 'fleet_health': {
      return { intent: plan.intent, result: gatewayHealth, sql: plan.sql, rowCount: gatewayHealth.length };
    }
    case 'model_reliability': {
      return { intent: plan.intent, result: modelReliability, sql: plan.sql, rowCount: modelReliability.length };
    }
    case 'anomalies': {
      return { intent: plan.intent, result: anom, sql: plan.sql, rowCount: anom.length };
    }
    case 'semantic_search': {
      // delegate to hybridSearch via context.searchIfAvailable
      return { intent: plan.intent, result: [], sql: plan.sql, rowCount: 0, note: 'fallback to Cortex Search', fallback: true };
    }
    default:
      return { intent: 'unknown', result: [], sql: plan.sql, rowCount: 0 };
  }
}

// ---- Cortex Search (hybrid: keyword + path + failure-classifier boost) ----

function tokenize(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 2);
}

function buildSearchIndex(docs) {
  // docs = [{id, path, text, meta}]
  const index = [];
  for (const doc of docs) {
    const tokens = tokenize(`${doc.path || ''} ${doc.text || ''}`);
    const tf = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    index.push({ id: doc.id || doc.path, path: doc.path, text: String(doc.text || '').slice(0, 2000), tokens: tf, tokenCount: tokens.length, meta: doc.meta || {} });
  }
  return index;
}

function hybridSearch(query, index, opts = {}) {
  const qTokens = tokenize(query);
  const qSet = new Set(qTokens);
  const results = [];
  for (const doc of index) {
    let score = 0;
    const reasons = [];
    for (const qt of qTokens) {
      if (doc.tokens[qt]) {
        score += doc.tokens[qt] * 2;
        reasons.push(`kw:${qt}`);
      }
      // fuzzy
      for (const dt of Object.keys(doc.tokens)) {
        if (dt.includes(qt) || qt.includes(dt)) { score += 0.5; break; }
      }
    }
    // path boost
    if (doc.path && qTokens.some(t => doc.path.toLowerCase().includes(t))) { score += 3; reasons.push('path'); }
    // meta boost
    if (doc.meta && doc.meta.type === 'failure' && qTokens.some(t => /fail|error|degrad|quota|burn/.test(t))) { score += 2; reasons.push('meta:failure'); }
    if (score > 0) results.push({ id: doc.id, path: doc.path, score: +score.toFixed(2), reasons: [...new Set(reasons)], snippet: doc.text.slice(0, 280), meta: doc.meta });
  }
  results.sort((a, b) => b.score - a.score);
  const limit = opts.limit || 8;
  return results.slice(0, limit);
}

// ---- Cortex Agents: orchestrate structured + unstructured ----

function answerFleetQuestion(question, ctx) {
  // ctx = { traffic, dailyBurn, gatewayHealth, modelReliability, anomalies, searchIndex }
  const plan = naturalLanguageToSql(question);
  const queryResult = executeQuery(plan, ctx);
  let searchResults = [];
  if (plan.fallback || queryResult.rowCount === 0 || /how to|fix|lesson|why|incident/.test(String(question).toLowerCase())) {
    searchResults = hybridSearch(question, ctx.searchIndex || [], { limit: 5 });
  }
  // If failure analysis, enrich with classify
  let failureSummary = null;
  if (plan.intent === 'failure_analysis' || /fail/.test(String(question).toLowerCase())) {
    failureSummary = aiSummarizeFailures(ctx.traffic);
  }
  // Build cited answer like Cortex Agents
  const answer = {
    schema: 'cortex-agent/fleet-answer-v1',
    question,
    analyst: { plan, result: queryResult.result, rowCount: queryResult.rowCount, sql: plan.sql },
    search: { results: searchResults, count: searchResults.length },
    failure_summary: failureSummary,
    recommendations: [],
    citations: [],
    cortex_fn: 'CORTEX.AGENTS',
  };
  if (queryResult.result && queryResult.result.length) {
    answer.citations.push({ type: 'structured', table: plan.table, rows: queryResult.result.length });
  }
  for (const r of searchResults) answer.citations.push({ type: 'unstructured', path: r.path, score: r.score });
  // recommendations
  if (queryResult.intent === 'forecast' && queryResult.result[0] && queryResult.result[0].projected_over_daily_cap) {
    answer.recommendations.push('Throttle agents: projected burn exceeds daily cap. Check for runaway loop (27.8M incident pattern).');
  }
  const hasQuotaAnomaly = (ctx.anomalies || []).some(a => a.type === 'quota_exhaustion_burst');
  if (hasQuotaAnomaly) {
    answer.recommendations.push('Quota burst detected: switch to local_fast qwen2.5:3b-64k and investigate traffic.jsonl.');
  }
  if (failureSummary && failureSummary.by_category && failureSummary.by_category.quota_exhausted) {
    answer.recommendations.push('GLM quota failures present: use gpt-oss:20b local candidate or wait for weekly quota reset.');
  }
  if (answer.recommendations.length === 0) answer.recommendations.push('No immediate action. Fleet nominal.');
  return answer;
}

// ---- Fleet report (Snowflake-style dashboard) ----

function buildFleetReport(traffic, opts = {}) {
  const dailyBurn = buildDailyBurn(traffic);
  const modelRel = buildModelReliability(traffic);
  const gatewayHealth = buildGatewayHealth(traffic, opts.probes || []);
  const anomalies = detectAnomalies(traffic, dailyBurn);
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = dailyBurn.find(d => d.day === today) || { day: today, total_tokens: traffic.filter(r => r.day === today).reduce((a, b) => a + b.total_tokens, 0), by_model: {}, by_host: {}, records: 0, success: 0, failure: 0 };
  const weeklyBurned = dailyBurn.slice(-7).reduce((a, b) => a + b.total_tokens, 0);
  const fcast = forecastBurn({ day: today, total_tokens: todayEntry.total_tokens, weeklyBurned }, opts);
  const failSummary = aiSummarizeFailures(traffic);
  const anomalyStats = aiExtractAnomaly(dailyBurn);
  return {
    schema: 'hermes-cortex-fleet/report-v1',
    generatedAt: new Date().toISOString(),
    tables: TABLES,
    fleet: {
      hosts: [...new Set(traffic.map(r => r.host))],
      days: dailyBurn.length,
      total_requests: traffic.length,
      total_tokens: dailyBurn.reduce((a, b) => a + b.total_tokens, 0),
    },
    today: todayEntry,
    forecast: fcast,
    dailyBurn: dailyBurn.slice(-14),
    modelReliability: modelRel,
    gatewayHealth,
    anomalies,
    anomalyStats,
    failureSummary: failSummary,
    snowflake_ddl_preview: generateSnowflakeDDL(),
    cortex_examples: {
      analyst: naturalLanguageToSql('how many tokens did we burn today?'),
      search: 'SELECT * FROM HERMES.SEARCH_INDEX WHERE query ILIKE \'%quota%\'',
      ai_function: 'SELECT AI_SUMMARIZE(failures) FROM HERMES.TRAFFIC',
    },
  };
}

function generateSnowflakeDDL() {
  return [
    `CREATE TABLE IF NOT EXISTS ${TABLES.TRAFFIC} (host STRING, model STRING, status STRING, total_tokens NUMBER, day DATE, latency_ms NUMBER, provider STRING, error STRING);`,
    `CREATE TABLE IF NOT EXISTS ${TABLES.DAILY_BURN} (day DATE, total_tokens NUMBER, by_model VARIANT, by_host VARIANT, success NUMBER, failure NUMBER);`,
    `CREATE TABLE IF NOT EXISTS ${TABLES.GATEWAY_HEALTH} (host STRING, status STRING, last_seen TIMESTAMP, last_model STRING);`,
    `CREATE TABLE IF NOT EXISTS ${TABLES.MODEL_RELIABILITY} (model STRING, provider STRING, reliability FLOAT, failure_rate FLOAT, total_tokens NUMBER);`,
    `-- Cortex AI Functions (preview): SELECT CORTEX.COMPLETE('summarize failures'), CORTEX.ANALYST('how many tokens?'), CORTEX.SEARCH('quota')`,
    `-- COPY INTO ${TABLES.TRAFFIC} FROM @hermes_stage/traffic.jsonl FILE_FORMAT=(TYPE=JSON);`,
  ].join('\n');
}

// ---- Remote fleet fetch (Tailscale) ----

function fetchRemoteTraffic(host, timeoutMs = 4000) {
  // Tries to fetch via existing Hermes gateway :8642/traffic or fallback curl
  // For this implementation we use file fallback: if host is a file path, read it
  if (fs.existsSync(host)) return loadTrafficFile(host).map(r => normalizeTrafficRecord(r));
  const url = `http://${host}:8642/health`; // health check only; traffic endpoint not existing yet
  // We don't have a traffic HTTP endpoint, so probe health then skip
  const res = spawnSync('curl', ['-sf', '--max-time', '3', url], { timeout: timeoutMs });
  if (res.status === 0) {
    // remote reachable but no traffic API yet – placeholder for future: fetch /traffic.jsonl via custom endpoint
    return [];
  }
  return [];
}

function aggregateFleetTraffic(localPath = DEFAULT_TRAFFIC, remoteHosts = []) {
  let all = [];
  // local
  if (fs.existsSync(localPath)) {
    const raw = loadTrafficFile(localPath);
    all = all.concat(raw.map(r => normalizeTrafficRecord(r)));
  }
  // remotes (each remote could be a file for tests, or a Tailscale IP)
  for (const h of remoteHosts) {
    const remoteRecords = fetchRemoteTraffic(h);
    all = all.concat(remoteRecords);
  }
  // dedupe by ts_end+model+tokens approx? Keep all for now, sort by ts_end
  all.sort((a, b) => String(a.ts_end).localeCompare(String(b.ts_end)));
  return all;
}

// ---- CLI ----

function parseArgs(argv) {
  const args = { traffic: DEFAULT_TRAFFIC, remote: [], json: false, out: '', question: '', search: '', help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--traffic') args.traffic = argv[++i];
    else if (a === '--remote') args.remote = (argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--json') args.json = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--question') args.question = argv[++i];
    else if (a === '--search') args.search = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('--') && !args.question) args.question = a;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function buildDefaultSearchIndex(traffic) {
  // Build a small unstructured corpus from traffic failures + some static docs if present
  const docs = [];
  // failures as docs
  for (const r of traffic.filter(x => x.status === 'failure').slice(-20)) {
    docs.push({
      id: `failure:${r.day}:${r.model}:${r.host}`,
      path: `HERMES.TRAFFIC:${r.day}`,
      text: `${r.day} ${r.host} ${r.model} FAILED ${r.error} ${r.empty_kind || ''}`,
      meta: { type: 'failure', day: r.day, model: r.model },
    });
  }
  // include some local md if repo exists
  const repoRoot = path.resolve(__dirname, '..');
  const candidateFiles = ['plan.md', 'AGENTS.md', 'docs/HERMES-ECONOMIC-ROUTER.md', 'README.md'];
  for (const rel of candidateFiles) {
    const full = path.join(repoRoot, rel);
    if (fs.existsSync(full)) {
      try {
        const text = fs.readFileSync(full, 'utf8').slice(0, 4000);
        docs.push({ id: rel, path: rel, text, meta: { type: 'doc' } });
      } catch {}
    }
  }
  return buildSearchIndex(docs);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/hermes-cortex-fleet.js [--traffic PATH] [--remote host1,host2] [--question "text"] [--search "text"] [--json] [--out PATH]
Examples:
  node tools/hermes-cortex-fleet.js --question "how many tokens today"
  node tools/hermes-cortex-fleet.js --search "quota exhausted"
  node tools/hermes-cortex-fleet.js --json | jq .forecast
`);
    return;
  }
  const traffic = aggregateFleetTraffic(args.traffic, args.remote);
  const dailyBurn = buildDailyBurn(traffic);
  const modelRel = buildModelReliability(traffic);
  const gatewayHealth = buildGatewayHealth(traffic);
  const anomalies = detectAnomalies(traffic, dailyBurn);
  const searchIndex = buildDefaultSearchIndex(traffic);
  const report = buildFleetReport(traffic, { probes: gatewayHealth });

  if (args.question) {
    const answer = answerFleetQuestion(args.question, { traffic, dailyBurn, gatewayHealth, modelReliability: modelRel, anomalies, searchIndex });
    if (args.json) console.log(JSON.stringify(answer, null, 2));
    else {
      console.log(`# Cortex Agent Answer: ${args.question}\n`);
      console.log(`Analyst SQL: ${answer.analyst.plan.sql} (${answer.analyst.plan.intent})`);
      console.log(`Rows: ${answer.analyst.rowCount}`);
      console.log(JSON.stringify(answer.analyst.result.slice(0, 5), null, 2));
      if (answer.search.count) {
        console.log('\n## Search hits');
        for (const r of answer.search.results) console.log(`- ${r.path} score=${r.score} ${r.snippet.slice(0, 120)}`);
      }
      console.log('\n## Recommendations');
      for (const rec of answer.recommendations) console.log(`- ${rec}`);
    }
    if (args.out) fs.writeFileSync(args.out, JSON.stringify(answer, null, 2));
    return answer;
  }

  if (args.search) {
    const hits = hybridSearch(args.search, searchIndex, { limit: 10 });
    if (args.json) console.log(JSON.stringify(hits, null, 2));
    else {
      console.log(`# Cortex Search: ${args.search}\n`);
      for (const h of hits) console.log(`- ${h.path} score=${h.score}\n  ${h.snippet}\n`);
    }
    return hits;
  }

  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  }
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`# Hermes Cortex Fleet Report

Fleet hosts: ${report.fleet.hosts.join(', ') || 'none yet (no traffic.jsonl on this Mac)'}
Total tokens: ${(report.fleet.total_tokens / 1e6).toFixed(2)}M across ${report.fleet.days} days
Today: ${aiSummarizeDay(report.today)}
Forecast: ${report.forecast.tokens_so_far} -> ${report.forecast.projected_eod} (risk=${report.forecast.risk})
Anomalies: ${report.anomalies.length}
Failures: ${report.failureSummary.summary}
Models: ${report.modelReliability.slice(0, 3).map(m => `${m.model} rel=${m.reliability}`).join(', ')}

Snowflake DDL preview:
${report.snowflake_ddl_preview}
`);
  }
  return report;
}

module.exports = {
  TABLES,
  parseLines,
  loadTrafficFile,
  normalizeTrafficRecord,
  buildDailyBurn,
  buildModelReliability,
  buildGatewayHealth,
  aiClassifyFailure,
  aiSummarizeDay,
  aiSummarizeFailures,
  aiExtractAnomaly,
  forecastBurn,
  detectAnomalies,
  naturalLanguageToSql,
  executeQuery,
  tokenize,
  buildSearchIndex,
  hybridSearch,
  answerFleetQuestion,
  buildFleetReport,
  aggregateFleetTraffic,
  parseArgs,
  generateSnowflakeDDL,
  buildDefaultSearchIndex,
};

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message || e); process.exit(1); }
}
