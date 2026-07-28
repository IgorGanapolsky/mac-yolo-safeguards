#!/usr/bin/env node
'use strict';

/**
 * hermes-inference-gateway.js — TensorZero-inspired inference observability layer.
 *
 * Records every LLM inference call across the Hermes fleet (Mac Pro + Mac Mini):
 * model, provider, route, task class, tokens, latency, cost, success/failure.
 *
 * Enables:
 *   - Fleet-wide cost tracking by model/provider/route/day
 *   - Reliability scoring from observed outcomes
 *   - Latency profiling for route optimization
 *   - Canary A/B comparison between candidate and default routes
 *
 * Data model: JSONL, append-only per day @ ~/.hermes/inference-traces/YYYY-MM-DD.jsonl
 *
 * Usage:
 *   node tools/hermes-inference-gateway.js record <fields...>   # record one inference
 *   node tools/hermes-inference-gateway.js query [--since N] [--model X] [--route Y] [--json]
 *   node tools/hermes-inference-gateway.js summary [--since N] [--by model|provider|route|day] [--json]
 *   node tools/hermes-inference-gateway.js cost [--since N] [--json]
 *   node tools/hermes-inference-gateway.js compare --route-a X --route-b Y [--since N] [--json]
 *   node tools/hermes-inference-gateway.js trace-path
 *   node tools/hermes-inference-gateway.js ingest-jsonl --file path
 *   node tools/hermes-inference-gateway.js health
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRACE_DIR = path.join(os.homedir(), '.hermes', 'inference-traces');
const PROBE_INTERVAL_MS = 30_000; // health probe freshness (30s)

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tracePath(dateStr = today()) {
  return path.join(TRACE_DIR, `${dateStr}.jsonl`);
}

/** Round-trip cost estimates per 1M tokens (USD, approximate). */
const COST_PER_1M = Object.freeze({
  // OpenRouter models
  'glm-5.2':                  { input: 0.93,  output: 3.00 },
  'claude-sonnet-5':          { input: 2.00,  output: 10.00 },
  'qwen3.7-plus':             { input: 0.32,  output: 1.28 },
  'kimi-k2.7-code':           { input: 0.74,  output: 3.50 },
  'kimi-k3':                  { input: 3.00,  output: 15.00 },
  'north-mini-code:free':     { input: 0,     output: 0 },
  'nex-n2-pro':               { input: 0.25,  output: 1.00 },
  'fugu-ultra':               { input: 5.00,  output: 30.00 },
  'nemotron-3-ultra-550b-a55b': { input: null, output: null },
  'nemotron-3-super-120b-a12b:free': { input: 0, output: 0 },
  'openrouter/fusion':        { input: 2.00,  output: 8.00 },
  'openrouter/advisor':       { input: 1.00,  output: 4.00 },
  'openrouter/subagent':      { input: 0.50,  output: 1.50 },
  // Grok
  'grok-4.5':                 { input: 2.00,  cached: 0.50, output: 6.00 },
  // Local models
  'qwen2.5:3b-64k':           { input: 0,     output: 0 },
  'gpt-oss:20b':              { input: 0,     output: 0 },
  'qwen3:35b-a3b':            { input: 0,     output: 0 },
});

const COST_BY_PROVIDER = Object.freeze({
  'custom:ollama-local-64k': { input: 0, output: 0 },
  'custom:zai-coding-glm':   { input: 0.93, output: 3.00 },
  'custom:openrouter-glm52': { input: 0.93, output: 3.00 },
  'custom:openrouter-kimi-k3': { input: 3.00, output: 15.00 },
  'openrouter':              { input: null, output: null }, // dynamic from model
  'grok-build-cli':          { input: 2.00, cached: 0.50, output: 6.00 },
  'parallel-search':         { input: null, output: null }, // per-request fees
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateCost(model, provider, inputTokens, outputTokens) {
  const rate = COST_PER_1M[model] || { input: null, output: null };
  let inputRate = rate.input;
  let outputRate = rate.output;

  // Fallback: try provider rate
  if (inputRate == null) {
    const provRate = COST_BY_PROVIDER[provider];
    if (provRate) {
      inputRate = provRate.input;
      outputRate = provRate.output;
    }
  }

  if (inputRate == null || outputRate == null) return null;
  const cost = (
    (inputTokens || 0) / 1_000_000 * (inputRate || 0) +
    (outputTokens || 0) / 1_000_000 * (outputRate || 0)
  );
  return Number(cost.toFixed(6));
}

function makeRecord({
  model = '',
  provider = '',
  route = '',
  taskClass = '',
  inputTokens = 0,
  outputTokens = 0,
  latencyMs = 0,
  success = true,
  error = '',
  hostRole = '',
  sessionId = '',
  costUsd,
  label = '',
} = {}) {
  const ts = new Date().toISOString();
  const computedCost = costUsd != null
    ? Number(costUsd)
    : estimateCost(model, provider, inputTokens, outputTokens);
  return {
    ts,
    model,
    provider,
    route,
    task_class: taskClass || classifyTask(taskClass, model, provider),
    input_tokens: Math.max(0, Math.floor(inputTokens)),
    output_tokens: Math.max(0, Math.floor(outputTokens)),
    latency_ms: Math.max(0, Math.floor(latencyMs)),
    cost_usd: computedCost,
    success: Boolean(success),
    error: String(error || '').slice(0, 500),
    host_role: hostRole,
    session_id: String(sessionId || '').slice(0, 64),
    label: String(label || '').slice(0, 200),
  };
}

function classifyTask(taskClass, model, provider) {
  if (taskClass) return taskClass;
  if (/ollama|local|qwen2\.5|gpt-oss|qwen3/.test(model)) return 'local';
  if (/glm|zai|z-ai/.test(model)) return 'reasoning';
  if (/grok/.test(provider || model)) return 'verification';
  if (/parallel|search/.test(provider || '')) return 'search';
  if (/nemotron|fugu|fusion|advisor|subagent/.test(model)) return 'escalation';
  if (/claude|sonnet|kimi-k3/.test(model)) return 'frontier';
  return 'general';
}

function validateRecord(r) {
  if (!r.model) return 'model is required';
  if (!r.provider) return 'provider is required';
  if (!Number.isFinite(r.latency_ms) || r.latency_ms < 0) return 'latency_ms must be non-negative';
  if (r.input_tokens != null && (!Number.isFinite(r.input_tokens) || r.input_tokens < 0)) return 'input_tokens must be non-negative';
  if (r.output_tokens != null && (!Number.isFinite(r.output_tokens) || r.output_tokens < 0)) return 'output_tokens must be non-negative';
  return null;
}

// ---------------------------------------------------------------------------
// Trace directory management
// ---------------------------------------------------------------------------

function ensureTraceDir() {
  if (!fs.existsSync(TRACE_DIR)) {
    fs.mkdirSync(TRACE_DIR, { recursive: true });
  }
}

function ensureTraceFile(dateStr) {
  ensureTraceDir();
  const p = tracePath(dateStr);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, '', 'utf8');
  }
  return p;
}

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------

async function record(recordInput, { writeImmediate = true } = {}) {
  if (!recordInput) throw new Error('record object is required');

  // Build the normalized record first, then validate the output (snake_case)
  const r = makeRecord(recordInput);
  const validation = validateRecord(r);
  if (validation) throw new Error(`Invalid record: ${validation}`);
  const p = ensureTraceFile(today());

  if (writeImmediate) {
    fs.appendFileSync(p, JSON.stringify(r) + '\n', 'utf8');
  }

  return r;
}

// ---------------------------------------------------------------------------
// Read traces (iterator-based for memory efficiency)
// ---------------------------------------------------------------------------

function* readTraces({ since, until, model, provider, route, success, hostRole, label } = {}) {
  ensureTraceDir();
  const files = fs.readdirSync(TRACE_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  const now = Date.now();
  const sinceTs = since ? parseSince(since, now) : null;
  const untilTs = until ? new Date(until).getTime() : null;

  for (const file of files) {
    const filePath = path.join(TRACE_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n').filter(Boolean)) {
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      // Trace-level timestamp filtering (more precise than file-level)
      if (sinceTs || untilTs) {
        const traceTs = new Date(r.ts).getTime();
        if (!Number.isFinite(traceTs)) continue;
        if (sinceTs && traceTs < sinceTs) continue;
        if (untilTs && traceTs > untilTs) continue;
      }
      if (model && r.model !== model) continue;
      if (provider && r.provider !== provider) continue;
      if (route && r.route !== route) continue;
      if (success != null && r.success !== success) continue;
      if (hostRole && r.host_role !== hostRole) continue;
      if (label && !r.label?.includes(label)) continue;
      yield r;
    }
  }
}

function parseSince(value, now = Date.now()) {
  const str = String(value);
  const match = str.match(/^(\d+)(h|d|m|s|w)$/);
  if (!match) {
    // Try ISO date
    const ts = new Date(str).getTime();
    if (Number.isFinite(ts)) return ts;
    return null;
  }
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return now - num * (multipliers[unit] || 3600000);
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

function query(opts = {}) {
  const results = [];
  for (const r of readTraces(opts)) {
    results.push(r);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function summary({ by = 'model', since, hostRole } = {}) {
  const groups = {};
  let total = 0;

  for (const r of readTraces({ since, hostRole })) {
    const key = r[by] || 'unknown';
    if (!groups[key]) {
      groups[key] = { count: 0, successCount: 0, totalTokens: 0, totalCost: 0, totalLatencyMs: 0, errorCount: 0 };
    }
    const g = groups[key];
    g.count += 1;
    if (r.success) g.successCount += 1;
    else g.errorCount += 1;
    g.totalTokens += (r.input_tokens || 0) + (r.output_tokens || 0);
    g.totalCost += r.cost_usd || 0;
    g.totalLatencyMs += r.latency_ms || 0;
    total += 1;
  }

  const stats = Object.entries(groups)
    .map(([key, g]) => ({
      [by]: key,
      count: g.count,
      successRate: g.count > 0 ? Number((g.successCount / g.count * 100).toFixed(1)) : 0,
      avgLatencyMs: g.count > 0 ? Math.round(g.totalLatencyMs / g.count) : 0,
      totalCostUsd: Number(g.totalCost.toFixed(4)),
      totalTokens: g.totalTokens,
      avgTokensPerCall: g.count > 0 ? Math.round(g.totalTokens / g.count) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalCalls: total,
    by: by,
    since: since || 'all',
    stats,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cost report
// ---------------------------------------------------------------------------

function costReport({ since } = {}) {
  const byModel = {};
  const byProvider = {};
  const byDay = {};
  let totalCost = 0;
  let totalCalls = 0;

  for (const r of readTraces({ since })) {
    const cost = r.cost_usd || 0;
    totalCost += cost;
    totalCalls += 1;

    const day = r.ts?.slice(0, 10) || 'unknown';
    if (!byDay[day]) byDay[day] = { calls: 0, cost: 0 };
    byDay[day].calls += 1;
    byDay[day].cost += cost;

    const model = r.model || 'unknown';
    if (!byModel[model]) byModel[model] = { calls: 0, cost: 0, tokens: 0 };
    byModel[model].calls += 1;
    byModel[model].cost += cost;
    byModel[model].tokens += (r.input_tokens || 0) + (r.output_tokens || 0);

    const provider = r.provider || 'unknown';
    if (!byProvider[provider]) byProvider[provider] = { calls: 0, cost: 0 };
    byProvider[provider].calls += 1;
    byProvider[provider].cost += cost;
  }

  return {
    totalCalls,
    totalCostUsd: Number(totalCost.toFixed(4)),
    byDay: Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, d]) => ({ day, ...d, cost: Number(d.cost.toFixed(4)) })),
    byModel: Object.entries(byModel)
      .sort(([, a], [, b]) => b.cost - a.cost)
      .map(([model, m]) => ({ model, ...m, cost: Number(m.cost.toFixed(4)) })),
    byProvider: Object.entries(byProvider)
      .sort(([, a], [, b]) => b.cost - a.cost)
      .map(([provider, p]) => ({ provider, ...p, cost: Number(p.cost.toFixed(4)) })),
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Compare (canary A/B)
// ---------------------------------------------------------------------------

function compareRoutes(routeA, routeB, { since } = {}) {
  const tracesA = [];
  const tracesB = [];

  for (const r of readTraces({ since, route: routeA })) tracesA.push(r);
  for (const r of readTraces({ since, route: routeB })) tracesB.push(r);

  function stats(arr) {
    if (arr.length === 0) return null;
    const successCount = arr.filter((r) => r.success).length;
    const costs = arr.map((r) => r.cost_usd || 0);
    const latencies = arr.map((r) => r.latency_ms || 0);
    const totalCost = costs.reduce((s, c) => s + c, 0);
    const totalTokens = arr.reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0);
    return {
      calls: arr.length,
      successRate: Number((successCount / arr.length * 100).toFixed(1)),
      avgLatencyMs: Math.round(latencies.reduce((s, l) => s + l, 0) / arr.length),
      totalCostUsd: Number(totalCost.toFixed(4)),
      totalTokens,
      avgTokensPerCall: arr.length > 0 ? Math.round(totalTokens / arr.length) : 0,
    };
  }

  const aStats = stats(tracesA);
  const bStats = stats(tracesB);

  let recommendation = 'insufficient_data';
  if (aStats && bStats && aStats.calls >= 3 && bStats.calls >= 3) {
    const winRateA = aStats.successRate;
    const winRateB = bStats.successRate;
    if (winRateB > winRateA + 5 && bStats.avgLatencyMs <= aStats.avgLatencyMs * 1.5) {
      recommendation = 'prefer_route_b';
    } else if (winRateA > winRateB + 5 && aStats.avgLatencyMs <= bStats.avgLatencyMs * 1.5) {
      recommendation = 'prefer_route_a';
    } else if (winRateB > winRateA && bStats.totalCostUsd < aStats.totalCostUsd * 0.8) {
      recommendation = 'consider_route_b_cost_savings';
    } else if (winRateA > winRateB && aStats.totalCostUsd < bStats.totalCostUsd * 0.8) {
      recommendation = 'consider_route_a_cost_savings';
    } else {
      recommendation = 'comparable';
    }
  }

  return {
    routeA,
    routeB,
    since: since || 'all',
    routeA: aStats ? { route: routeA, ...aStats } : { route: routeA, calls: 0 },
    routeB: bStats ? { route: routeB, ...bStats } : { route: routeB, calls: 0 },
    recommendation,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

function health() {
  ensureTraceDir();
  const files = fs.readdirSync(TRACE_DIR).filter((f) => f.endsWith('.jsonl'));
  const todayFile = tracePath();
  const todayCalls = fs.existsSync(todayFile)
    ? fs.readFileSync(todayFile, 'utf8').split('\n').filter(Boolean).length
    : 0;
  // Sum all files for total
  let totalCalls = 0;
  for (const file of files) {
    const filePath = path.join(TRACE_DIR, file);
    totalCalls += fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).length;
  }
  const hostRole = detectFleetHostRole();
  return {
    ok: true,
    traceDir: TRACE_DIR,
    files: files.length,
    totalCalls,
    todayCalls,
    hostRole,
    checkedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Host role detection (shared with agent-swarm-harness.js)
// ---------------------------------------------------------------------------

function detectFleetHostRole(env = process.env) {
  const forced = String(env.HERMES_FLEET_HOST_ROLE || '').toLowerCase();
  if (forced === 'mac_pro' || forced === 'pro') return 'mac_pro';
  if (forced === 'mac_mini' || forced === 'mini') return 'mac_mini';
  let hostname = '';
  try {
    hostname = os.hostname().toLowerCase();
  } catch {
    return 'unknown';
  }
  if (/mac-?pro|igors-mac-pro|macpro/.test(hostname)) return 'mac_pro';
  if (/mac-?mini|igors-mac-mini|macmini/.test(hostname)) return 'mac_mini';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Ingest JSONL
// ---------------------------------------------------------------------------

function ingestJsonl(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  let ingested = 0;
  let errors = 0;

  ensureTraceDir();
  const p = ensureTraceFile(today());

  for (const line of lines) {
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      errors += 1;
      continue;
    }
    // Normalize via makeRecord then validate the output
    const recordObj = makeRecord(raw);
    const validation = validateRecord(recordObj);
    if (validation) {
      errors += 1;
      continue;
    }
    fs.appendFileSync(p, JSON.stringify(recordObj) + '\n', 'utf8');
    ingested += 1;
  }

  return { ingested, errors, traceFile: p };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  return `Usage:
  node tools/hermes-inference-gateway.js record --model X --provider Y [options]
  node tools/hermes-inference-gateway.js query [--since N] [--model X] [--route Y] [--json]
  node tools/hermes-inference-gateway.js summary [--since N] [--by model|provider|route|day] [--json]
  node tools/hermes-inference-gateway.js cost [--since N] [--json]
  node tools/hermes-inference-gateway.js compare --route-a X --route-b Y [--since N] [--json]
  node tools/hermes-inference-gateway.js trace-path
  node tools/hermes-inference-gateway.js ingest-jsonl --file path [--json]
  node tools/hermes-inference-gateway.js health

Record options:
  --model         Model name (required)
  --provider      Provider name (required)
  --route         Route id (e.g. glm52_reasoning)
  --task-class    Task classification (auto-detected if omitted)
  --input-tokens  Input token count
  --output-tokens Output token count
  --latency-ms    Latency in milliseconds (required)
  --success       true/false (default: true)
  --error         Error message if failed
  --cost-usd      Explicit cost override (auto-estimated if omitted)
  --host-role     mac_pro | mac_mini (auto-detected)
  --session-id    Optional session identifier
  --label         Free-text label for the call

Query/Summary filters:
  --since         Time range: 24h, 7d, 30d, or ISO date
  --until         ISO date upper bound
  --model         Filter by model
  --provider      Filter by provider
  --route         Filter by route id
  --host-role     Filter by host role
  --label         Filter by label substring
  
Summary:
  --by            Group by: model (default), provider, route, day

Env:
  HERMES_FLEET_HOST_ROLE  Override host role detection
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [], command: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--model') args.model = String(argv[++i] || '');
    else if (a === '--provider') args.provider = String(argv[++i] || '');
    else if (a === '--route') args.route = String(argv[++i] || '');
    else if (a === '--task-class') args.taskClass = String(argv[++i] || '');
    else if (a === '--input-tokens') args.inputTokens = parseInt(argv[++i], 10) || 0;
    else if (a === '--output-tokens') args.outputTokens = parseInt(argv[++i], 10) || 0;
    else if (a === '--latency-ms') args.latencyMs = parseInt(argv[++i], 10) || 0;
    else if (a === '--success') args.success = argv[++i] !== 'false' && argv[i] !== '0';
    else if (a === '--error') args.error = String(argv[++i] || '');
    else if (a === '--cost-usd') args.costUsd = parseFloat(argv[++i]);
    else if (a === '--host-role') args.hostRole = String(argv[++i] || '');
    else if (a === '--session-id') args.sessionId = String(argv[++i] || '');
    else if (a === '--label') args.label = String(argv[++i] || '');
    else if (a === '--since') args.since = String(argv[++i] || '24h');
    else if (a === '--until') args.until = String(argv[++i] || '');
    else if (a === '--by') args.by = String(argv[++i] || 'model');
    else if (a === '--route-a') args.routeA = String(argv[++i] || '');
    else if (a === '--route-b') args.routeB = String(argv[++i] || '');
    else if (a === '--file') args.file = String(argv[++i] || '');
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('--')) throw new Error(`Unknown argument: ${a}`);
    else if (!args.command) args.command = a;
    else args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs();
  if (args.help || !args.command) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const cmd = args.command;

  if (cmd === 'record') {
    if (!args.model || !args.provider) {
      console.error('record requires --model and --provider');
      process.exit(1);
    }
    const hostRole = args.hostRole || detectFleetHostRole();
    const r = await record({
      model: args.model,
      provider: args.provider,
      route: args.route || '',
      taskClass: args.taskClass || '',
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      latencyMs: args.latencyMs || 0,
      success: args.success !== false,
      error: args.error || '',
      hostRole,
      sessionId: args.sessionId || '',
      costUsd: args.costUsd,
      label: args.label || '',
    });
    if (args.json) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log(`recorded: ${r.model}/${r.provider} ${r.latency_ms}ms cost=${r.cost_usd ?? '?'} host=${r.host_role}`);
    }
    return;
  }

  if (cmd === 'query') {
    const results = query({
      since: args.since,
      until: args.until,
      model: args.model,
      provider: args.provider,
      route: args.route,
      hostRole: args.hostRole,
      label: args.label,
    });
    if (args.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(`Query: ${results.length} trace(s)`);
      for (const r of results.slice(-20)) {
        const status = r.success ? 'OK' : 'FAIL';
        console.log(`  ${r.ts?.slice(0, 19)} [${status}] ${r.model}/${r.provider} ${r.latency_ms}ms cost=${r.cost_usd ?? '?'} route=${r.route}`);
      }
      if (results.length > 20) console.log(`  ... ${results.length - 20} more`);
    }
    process.exit(results.length > 0 ? 0 : 0);
    return;
  }

  if (cmd === 'summary') {
    const s = summary({ by: args.by || 'model', since: args.since, hostRole: args.hostRole });
    if (args.json) {
      console.log(JSON.stringify(s, null, 2));
    } else {
      console.log(`Inference summary (${s.since}, grouped by ${s.by}):`);
      console.log(`Total calls: ${s.totalCalls}`);
      for (const stat of s.stats) {
        const key = stat[s.by] || 'unknown';
        console.log(`  ${key}: ${stat.count} calls, ${stat.successRate}% success, ${stat.avgLatencyMs}ms avg, $${stat.totalCostUsd} total`);
      }
    }
    return;
  }

  if (cmd === 'cost') {
    const c = costReport({ since: args.since });
    if (args.json) {
      console.log(JSON.stringify(c, null, 2));
    } else {
      console.log(`Cost report (${args.since || 'all time'}):`);
      console.log(`Total: $${c.totalCostUsd} (${c.totalCalls} calls)`);
      console.log('By model:');
      for (const m of c.byModel.slice(0, 10)) {
        console.log(`  ${m.model}: $${m.cost} (${m.calls} calls, ${m.tokens} tokens)`);
      }
      console.log('By day:');
      for (const d of c.byDay.slice(-14)) {
        console.log(`  ${d.day}: $${d.cost} (${d.calls} calls)`);
      }
    }
    return;
  }

  if (cmd === 'compare') {
    if (!args.routeA || !args.routeB) {
      console.error('compare requires --route-a and --route-b');
      process.exit(1);
    }
    const result = compareRoutes(args.routeA, args.routeB, { since: args.since });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Route comparison: ${args.routeA} vs ${args.routeB} (${result.since})`);
      const a = result.routeA;
      const b = result.routeB;
      console.log(`  ${a.route}: ${a.calls} calls, ${a.successRate}% success, ${a.avgLatencyMs}ms avg, $${a.totalCostUsd}`);
      console.log(`  ${b.route}: ${b.calls} calls, ${b.successRate}% success, ${b.avgLatencyMs}ms avg, $${b.totalCostUsd}`);
      console.log(`  Recommendation: ${result.recommendation}`);
    }
    return;
  }

  if (cmd === 'trace-path') {
    ensureTraceDir();
    const p = tracePath();
    console.log(p);
    return;
  }

  if (cmd === 'ingest-jsonl') {
    if (!args.file) {
      console.error('ingest-jsonl requires --file path');
      process.exit(1);
    }
    const result = ingestJsonl(args.file);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Ingested: ${result.ingested} records, ${result.errors} errors -> ${result.traceFile}`);
    }
    process.exit(result.errors > 0 ? 1 : 0);
    return;
  }

  if (cmd === 'health') {
    const h = health();
    if (args.json) {
      console.log(JSON.stringify(h, null, 2));
    } else {
      console.log(`Inference gateway: OK`);
      console.log(`  Trace dir: ${h.traceDir}`);
      console.log(`  Trace files: ${h.files}`);
      console.log(`  Total calls: ${h.totalCalls}`);
      console.log(`  Today calls: ${h.todayCalls}`);
      console.log(`  Host role: ${h.hostRole}`);
    }
    process.exit(h.ok ? 0 : 1);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  console.log(usage());
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Core
  makeRecord,
  estimateCost,
  validateRecord,
  record,
  query,
  summary,
  costReport,
  compareRoutes,
  health,
  ingestJsonl,
  // Constants
  TRACE_DIR,
  COST_PER_1M,
  COST_BY_PROVIDER,
  // Helpers
  tracePath,
  ensureTraceDir,
  ensureTraceFile,
  detectFleetHostRole,
  readTraces,
  classifyTask,
  parseSince,
  today,
  // CLI
  parseArgs,
  usage,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
