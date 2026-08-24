#!/usr/bin/env node
'use strict';

// Ramp/Stripe router-wars steal (TNS 2026-08-21) + self-improving eval loop.
//
// Do NOT clone OpenRouter / router.com. The transferable mechanic is:
//   1. Log asked vs served, provider, tier, tokens, latency, cost, fallbacks
//   2. Break quality out by the model that actually ran
//   3. Use that eval to propose routing changes — never auto-apply
//
// Cheap-cascade hazard (TDS / TNS): a 40% inference cut that sends "simple"
// coding asks to a free/local rung can look like a win in cost while quality
// (tools, desktop streaming) dies. Together-on-quota is NOT that hazard.
//
//   node tools/router-receipt.js --json
//   node tools/router-receipt.js --gate
//   node tools/router-receipt.js --gate --since-hours 6
//   node tools/router-receipt.js --log /path/to/traffic.jsonl --json

const fs = require('fs');
const os = require('os');
const path = require('path');
const { StringDecoder } = require('string_decoder');

const DEFAULT_LOG = path.join(os.homedir(), '.hermes', 'litellm-logs', 'traffic.jsonl');
const GLM_ASK = /^(glm-5\.3|glm-coding|glm-5\.2|glm-turbo|glm-47|glm-4\.7)$/i;
const TOGETHER_OK = /together\.xyz|zai-org\/GLM|together-glm/i;
const CHEAP_SERVED = /nemotron|qwen2\.5:3b|laguna|:free|hermes-local/i;
const NO_DEPLOY = /no deployments available/i;
const QUOTA_EXHAUST = /weekly\/monthly limit exhausted|limit will reset at/i;

function classifyTier(rec) {
  const base = String(rec.api_base || '');
  const model = String(rec.model || '');
  if (/127\.0\.0\.1|11434|11436/.test(base)) return 'local';
  if (base.includes('api.z.ai') || base.includes('api.kimi.com')) return 'subscription';
  if (base.includes('together.xyz')) return 'per_token';
  if (model.includes(':free')) return 'free';
  if (base.includes('openrouter')) return 'per_token';
  return 'unknown';
}

function askedGroup(rec) {
  const g = String(rec.model_group || '').split('/').pop();
  if (g) return g;
  return String(rec.model || '').split('/').pop();
}

function isTogetherPreserve(rec) {
  const asked = askedGroup(rec);
  if (!GLM_ASK.test(asked) && asked !== 'together-glm') return false;
  const served = String(rec.model || '');
  const base = String(rec.api_base || '');
  return TOGETHER_OK.test(served) || TOGETHER_OK.test(base) || asked === 'together-glm';
}

function isCheapCascade(rec) {
  const asked = askedGroup(rec);
  if (!GLM_ASK.test(asked)) return false;
  if (isTogetherPreserve(rec)) return false;
  const served = String(rec.model || '');
  const tier = classifyTier(rec);
  return CHEAP_SERVED.test(served) || tier === 'free' || tier === 'local';
}

function isSilentSubstitution(rec) {
  const asked = askedGroup(rec);
  const served = String(rec.model || '');
  if (!asked || !served) return false;
  if (asked === served) return false;
  if (served === asked || served.endsWith(`/${asked}`) || served.endsWith(`:${asked}`)) {
    return false;
  }
  if (isTogetherPreserve(rec)) return false;
  return true;
}

function isNoDeployments(rec) {
  return NO_DEPLOY.test(String(rec.error || ''));
}

function isQuotaExhaust(rec) {
  return QUOTA_EXHAUST.test(String(rec.error || ''));
}

function fallbackAttempts(rec) {
  const n = rec.fallback_attempts;
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  const prev = rec.previous_models;
  if (Array.isArray(prev)) return prev.length;
  return 0;
}

function parseTsEnd(rec) {
  const ts = rec && rec.ts_end;
  if (ts == null || ts === '') return null;
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    const ms = ts > 1e12 ? ts : ts * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = String(ts).trim();
  const iso = /T/.test(raw) ? raw : raw.replace(' ', 'T');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function filterSinceHours(records, sinceHours, now) {
  if (!(sinceHours > 0)) {
    return { records, droppedNoTs: 0, droppedOld: 0 };
  }
  const cutoff = (now || new Date()).getTime() - sinceHours * 3600 * 1000;
  const kept = [];
  let droppedNoTs = 0;
  let droppedOld = 0;
  for (const rec of records) {
    const d = parseTsEnd(rec);
    if (!d) {
      droppedNoTs += 1;
      continue;
    }
    if (d.getTime() < cutoff) {
      droppedOld += 1;
      continue;
    }
    kept.push(rec);
  }
  return { records: kept, droppedNoTs, droppedOld };
}

function receiptFrom(rec) {
  const asked = askedGroup(rec);
  const served = String(rec.model || '');
  const cheap = isCheapCascade(rec);
  const together = isTogetherPreserve(rec);
  const noDep = isNoDeployments(rec);
  const quota = isQuotaExhaust(rec);
  return {
    asked,
    served,
    provider: String(rec.api_base || '') || null,
    tier: classifyTier(rec),
    tokens: Number.isFinite(Number(rec.total_tokens)) ? Number(rec.total_tokens) : null,
    latency_s: Number.isFinite(Number(rec.latency_s)) ? Number(rec.latency_s) : null,
    cost: rec.response_cost == null ? null : Number(rec.response_cost),
    fallback_attempts: fallbackAttempts(rec),
    status: rec.status || null,
    silent_substitution: isSilentSubstitution(rec),
    cheap_cascade: cheap,
    together_preserve: together,
    no_deployments: noDep,
    quota_exhausted: quota,
    tools_offered: rec.tools_offered === true,
    has_tool_calls: rec.has_tool_calls === true,
  };
}

function project(d) {
  return {
    model: d.model,
    model_group: d.model_group,
    api_base: d.api_base,
    response_cost: d.response_cost,
    total_tokens: d.total_tokens,
    latency_s: d.latency_s,
    status: d.status,
    error: d.error,
    tools_offered: d.tools_offered,
    has_tool_calls: d.has_tool_calls,
    fallback_attempts: d.fallback_attempts,
    previous_models: d.previous_models,
    ts_end: d.ts_end,
  };
}

function summarizeReceipts(records) {
  const receipts = [];
  let malformed = 0;
  const byLane = new Map();

  for (const rec of records) {
    if (!rec || typeof rec !== 'object' || !rec.model) {
      malformed += 1;
      continue;
    }
    const r = receiptFrom(rec);
    receipts.push(r);
    const key = `${r.asked}→${r.served}|${r.tier}`;
    if (!byLane.has(key)) {
      byLane.set(key, {
        asked: r.asked,
        served: r.served,
        tier: r.tier,
        n: 0,
        success: 0,
        fail: 0,
        cheap_cascade: 0,
        together_preserve: 0,
        no_deployments: 0,
        quota_exhausted: 0,
        silent_substitution: 0,
        toolOffered: 0,
        toolCalled: 0,
        tokens: 0,
        cost: 0,
      });
    }
    const lane = byLane.get(key);
    lane.n += 1;
    if (r.status === 'success') lane.success += 1;
    else lane.fail += 1;
    if (r.cheap_cascade) lane.cheap_cascade += 1;
    if (r.together_preserve) lane.together_preserve += 1;
    if (r.no_deployments) lane.no_deployments += 1;
    if (r.quota_exhausted) lane.quota_exhausted += 1;
    if (r.silent_substitution) lane.silent_substitution += 1;
    if (r.tools_offered) {
      lane.toolOffered += 1;
      if (r.has_tool_calls) lane.toolCalled += 1;
    }
    if (Number.isFinite(r.tokens)) lane.tokens += r.tokens;
    if (Number.isFinite(r.cost)) lane.cost += r.cost;
  }

  const lanes = [...byLane.values()].sort((a, b) => b.n - a.n);
  const totals = receipts.reduce(
    (acc, r) => {
      acc.n += 1;
      if (r.status === 'success') acc.success += 1;
      if (r.cheap_cascade) acc.cheap_cascade += 1;
      if (r.together_preserve) acc.together_preserve += 1;
      if (r.no_deployments) acc.no_deployments += 1;
      if (r.quota_exhausted) acc.quota_exhausted += 1;
      if (r.silent_substitution) acc.silent_substitution += 1;
      return acc;
    },
    {
      n: 0,
      success: 0,
      cheap_cascade: 0,
      together_preserve: 0,
      no_deployments: 0,
      quota_exhausted: 0,
      silent_substitution: 0,
    },
  );

  const proposals = [];
  if (totals.no_deployments > 0) {
    proposals.push({
      kind: 'streaming_empty_group',
      severity: 'critical',
      action: 'keep_in_group_failover',
      apply: false,
      detail: `${totals.no_deployments} call(s) hit "No deployments available" — glm group had no live pool (desktop 429 class). Together in-group + quota remap, do not wait 45s.`,
    });
  }
  if (totals.cheap_cascade > 0 && totals.together_preserve === 0) {
    proposals.push({
      kind: 'cheap_cascade_quality_risk',
      severity: 'high',
      action: 'stop_defaulting_coding_to_free_local',
      apply: false,
      detail: `${totals.cheap_cascade} glm-* ask(s) served free/local. Cost win is not quality (TDS 40% cut that broke the product). Prefer together-glm while z.ai is capped.`,
    });
  }
  if (totals.together_preserve > 0 && totals.no_deployments === 0) {
    proposals.push({
      kind: 'quota_preserve_ok',
      severity: 'info',
      action: 'maintain',
      apply: false,
      detail: `${totals.together_preserve} glm ask(s) preserved on Together — expected while z.ai weekly/monthly is exhausted.`,
    });
  }
  if (proposals.length === 0) {
    proposals.push({
      kind: 'insufficient_or_healthy',
      severity: 'info',
      action: totals.n ? 'maintain' : 'collect_more_traffic',
      apply: false,
      detail: totals.n ? `n=${totals.n} no empty-group or cheap-cascade hazard` : 'no traffic rows',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'liteLLM traffic.jsonl',
    steal: 'instrument routing; eval-gated remap; never auto-apply; never clone OpenRouter',
    totals,
    lanes,
    proposals,
    malformed,
    sample: receipts.slice(-8),
  };
}

function gateFails(summary) {
  return (summary.proposals || []).some((p) => p.severity === 'critical');
}

function readLog(logPath) {
  if (!fs.existsSync(logPath)) return { ok: false, error: `no traffic log at ${logPath}` };
  const records = [];
  let malformed = 0;
  const decoder = new StringDecoder('utf8');
  const fd = fs.openSync(logPath, 'r');
  const CHUNK = 1 << 20;
  const buf = Buffer.allocUnsafe(CHUNK);
  let carry = '';
  const take = (line) => {
    const t = line.trim();
    if (!t) return;
    try {
      records.push(project(JSON.parse(t)));
    } catch {
      malformed += 1;
    }
  };
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, CHUNK, null)) > 0) {
      carry += decoder.write(buf.subarray(0, n));
      const parts = carry.split('\n');
      carry = parts.pop() || '';
      for (const line of parts) take(line);
    }
    carry += decoder.end();
    if (carry) take(carry);
  } finally {
    fs.closeSync(fd);
  }
  return { ok: true, records, malformed };
}

function runReport(options = {}) {
  const logPath = options.logPath || DEFAULT_LOG;
  const loaded = readLog(logPath);
  if (!loaded.ok) return { ok: false, error: loaded.error, logPath };
  const windowed = filterSinceHours(loaded.records, options.sinceHours, options.now);
  const summary = summarizeReceipts(windowed.records);
  summary.logPath = logPath;
  summary.parseMalformed = loaded.malformed;
  summary.sinceHours = options.sinceHours > 0 ? options.sinceHours : null;
  summary.droppedNoTs = windowed.droppedNoTs;
  summary.droppedOld = windowed.droppedOld;
  summary.ok = true;
  return summary;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let json = false;
  let gate = false;
  let logPath = DEFAULT_LOG;
  let sinceHours = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--gate') gate = true;
    else if (argv[i] === '--log') logPath = argv[++i] || logPath;
    else if (argv[i] === '--since-hours') {
      sinceHours = Number(argv[++i]);
      if (!Number.isFinite(sinceHours) || sinceHours <= 0) {
        console.error('invalid --since-hours (need a positive number)');
        process.exit(2);
      }
    }
  }
  const report = runReport({ logPath, sinceHours });
  if (report.ok === false) {
    console.error(report.error);
    process.exit(2);
  }
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    const t = report.totals;
    console.log(
      `router-receipt n=${t.n} success=${t.success} together=${t.together_preserve} cheap=${t.cheap_cascade} no_deploy=${t.no_deployments}`,
    );
    for (const p of report.proposals) {
      console.log(`  [${p.severity}] ${p.kind}: ${p.detail}`);
    }
    for (const lane of report.lanes.slice(0, 8)) {
      console.log(
        `  ${lane.asked} → ${lane.served} tier=${lane.tier} n=${lane.n} ok=${lane.success} fail=${lane.fail}`,
      );
    }
  }
  if (gate && gateFails(report)) process.exit(1);
}

module.exports = {
  classifyTier,
  askedGroup,
  isCheapCascade,
  isTogetherPreserve,
  isSilentSubstitution,
  isNoDeployments,
  receiptFrom,
  summarizeReceipts,
  gateFails,
  runReport,
  parseTsEnd,
  filterSinceHours,
  DEFAULT_LOG,
};
