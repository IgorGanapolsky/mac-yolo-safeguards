#!/usr/bin/env node
'use strict';

/**
 * Enrich LiteLLM traffic.jsonl into inference metrics:
 * task tag, tokens/sec, cost USD, latency vs task budget, failure rate.
 *
 * TTFT is not logged upstream yet — we approximate with:
 *   ttftProxyS = latency_s * (prompt_tokens / max(total_tokens, 1))
 * for prefill-heavy signal (documented as proxy, not true TTFT).
 *
 *   node tools/inference-eng/metrics.js --json
 *   node tools/inference-eng/metrics.js --window-hours 24 --json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyTask } = require('./task-registry');
const { estimateCostUsd } = require('./pricing');

const DEFAULT_LOG = path.join(os.homedir(), '.hermes', 'litellm-logs', 'traffic.jsonl');

function parseLogTs(value) {
  if (typeof value !== 'string') return NaN;
  return Date.parse(`${value.trim().replace(' ', 'T')}Z`);
}

function firstUserText(messages) {
  if (!Array.isArray(messages)) return '';
  for (const m of messages) {
    if (m && m.role === 'user') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content.map((c) => (c && c.text) || '').join(' ');
      }
    }
  }
  return '';
}

/**
 * @param {object} rec traffic.jsonl row
 * @returns {object} enriched metric
 */
function enrichRecord(rec) {
  const model = rec.model || 'unknown';
  const latencyS = Number(rec.latency_s) || 0;
  const promptTokens = Number(rec.prompt_tokens) || 0;
  const completionTokens = Number(rec.completion_tokens) || 0;
  const totalTokens = Number(rec.total_tokens) || promptTokens + completionTokens;
  const userText = firstUserText(rec.messages);
  const task = classifyTask(userText);
  const tokensPerSec = latencyS > 0 ? completionTokens / latencyS : null;
  const ttftProxyS =
    latencyS > 0 && totalTokens > 0 ? latencyS * (promptTokens / totalTokens) : null;
  const cost = estimateCostUsd(model, promptTokens, completionTokens);
  const withinBudget = latencyS * 1000 <= task.latencyBudgetMs;
  const toolCompliant =
    rec.tools_offered === true
      ? rec.has_tool_calls === true
        ? 1
        : 0
      : null;

  return {
    model,
    status: rec.status || 'unknown',
    taskId: task.id,
    modelClass: task.modelClass,
    latencyS,
    ttftProxyS,
    tokensPerSec,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: cost.usd,
    costTier: cost.tier,
    withinBudget,
    latencyBudgetMs: task.latencyBudgetMs,
    toolCompliant,
    toolsOffered: Boolean(rec.tools_offered),
    hasToolCalls: Boolean(rec.has_tool_calls),
    businessKpi: task.businessKpi,
    ts: rec.ts_end || null,
  };
}

/**
 * Read at most maxBytes from the end of a (potentially multi-GB) traffic log.
 * Full-file readFileSync blows the string length cap on busy fleets.
 */
function readLogTail(logPath, maxBytes = 8 * 1024 * 1024) {
  const stat = fs.statSync(logPath);
  const size = stat.size;
  if (size === 0) return '';
  const start = Math.max(0, size - maxBytes);
  const fd = fs.openSync(logPath, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString('utf8');
    // If we started mid-line, drop the partial first line
    if (start > 0) {
      const nl = text.indexOf('\n');
      if (nl >= 0) text = text.slice(nl + 1);
    }
    return text;
  } finally {
    fs.closeSync(fd);
  }
}

function loadTraffic(logPath = DEFAULT_LOG, options = {}) {
  if (!fs.existsSync(logPath)) return [];
  const windowHours = Number(options.windowHours || 0);
  const cutoff = windowHours > 0 ? Date.now() - windowHours * 3600 * 1000 : 0;
  const maxBytes = Number(options.maxBytes || process.env.HERMES_TRAFFIC_TAIL_BYTES || 8 * 1024 * 1024);
  const maxLines = Number(options.maxLines || 5000);
  let text;
  try {
    text = readLogTail(logPath, maxBytes);
  } catch {
    return [];
  }
  const lines = text.split('\n').filter(Boolean);
  const slice = lines.length > maxLines ? lines.slice(-maxLines) : lines;
  const out = [];
  for (const line of slice) {
    try {
      const rec = JSON.parse(line);
      if (cutoff) {
        const ts = parseLogTs(rec.ts_end);
        if (!Number.isFinite(ts) || ts < cutoff) continue;
      }
      out.push(enrichRecord(rec));
    } catch {
      /* skip bad lines */
    }
  }
  return out;
}

function summarize(metrics) {
  const byTask = {};
  const byModel = {};
  let ok = 0;
  let fail = 0;
  let costUsd = 0;
  let latencySum = 0;
  let withinBudget = 0;
  let budgetN = 0;

  for (const m of metrics) {
    if (m.status === 'failure') fail += 1;
    else ok += 1;
    costUsd += m.costUsd || 0;
    latencySum += m.latencyS || 0;
    if (typeof m.withinBudget === 'boolean') {
      budgetN += 1;
      if (m.withinBudget) withinBudget += 1;
    }
    byTask[m.taskId] = byTask[m.taskId] || { n: 0, fail: 0, latencySum: 0, costUsd: 0 };
    byTask[m.taskId].n += 1;
    byTask[m.taskId].fail += m.status === 'failure' ? 1 : 0;
    byTask[m.taskId].latencySum += m.latencyS || 0;
    byTask[m.taskId].costUsd += m.costUsd || 0;

    byModel[m.model] = byModel[m.model] || { n: 0, fail: 0, toolOffered: 0, toolCalls: 0 };
    byModel[m.model].n += 1;
    byModel[m.model].fail += m.status === 'failure' ? 1 : 0;
    if (m.toolsOffered) byModel[m.model].toolOffered += 1;
    if (m.hasToolCalls) byModel[m.model].toolCalls += 1;
  }

  const n = metrics.length || 1;
  return {
    n: metrics.length,
    ok,
    fail,
    successRate: metrics.length ? ok / metrics.length : null,
    meanLatencyS: metrics.length ? latencySum / metrics.length : null,
    budgetHitRate: budgetN ? withinBudget / budgetN : null,
    totalCostUsd: costUsd,
    costPer1kRuns: metrics.length ? (costUsd / metrics.length) * 1000 : null,
    byTask: Object.fromEntries(
      Object.entries(byTask).map(([id, v]) => [
        id,
        {
          n: v.n,
          failRate: v.n ? v.fail / v.n : null,
          meanLatencyS: v.n ? v.latencySum / v.n : null,
          costUsd: v.costUsd,
        },
      ]),
    ),
    byModel: Object.fromEntries(
      Object.entries(byModel).map(([id, v]) => [
        id,
        {
          n: v.n,
          failRate: v.n ? v.fail / v.n : null,
          toolCompliance: v.toolOffered ? v.toolCalls / v.toolOffered : null,
        },
      ]),
    ),
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let json = false;
  let windowHours = 168;
  let logPath = DEFAULT_LOG;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--window-hours') windowHours = Number(argv[++i] || 168);
    else if (argv[i] === '--log') logPath = argv[++i] || DEFAULT_LOG;
  }
  const metrics = loadTraffic(logPath, { windowHours });
  const summary = summarize(metrics);
  if (json) process.stdout.write(`${JSON.stringify({ summary, sample: metrics.slice(-5) }, null, 2)}\n`);
  else {
    console.log(
      `Inference metrics (window=${windowHours}h): n=${summary.n} ok=${summary.ok} fail=${summary.fail} ` +
        `success=${summary.successRate == null ? 'n/a' : (summary.successRate * 100).toFixed(1) + '%'} ` +
        `mean_lat=${summary.meanLatencyS == null ? 'n/a' : summary.meanLatencyS.toFixed(2) + 's'} ` +
        `budget_hit=${summary.budgetHitRate == null ? 'n/a' : (summary.budgetHitRate * 100).toFixed(1) + '%'} ` +
        `cost_usd=${summary.totalCostUsd.toFixed(4)}`,
    );
    for (const [id, v] of Object.entries(summary.byTask)) {
      console.log(
        `  task=${id} n=${v.n} fail=${v.failRate == null ? 'n/a' : (v.failRate * 100).toFixed(0) + '%'} ` +
          `mean_lat=${v.meanLatencyS == null ? 'n/a' : v.meanLatencyS.toFixed(2) + 's'}`,
      );
    }
  }
}

module.exports = {
  DEFAULT_LOG,
  enrichRecord,
  loadTraffic,
  summarize,
  firstUserText,
  parseLogTs,
};
