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
const DEFAULT_GROK_RECEIPT_HISTORY = path.join(
  os.homedir(),
  '.hermes',
  'receipts',
  'hermes-yolo',
  'history.jsonl',
);

/** Models that currently return empty completions under quota thrash (z.ai weekly cap). */
const DEFAULT_DEAD_MODEL_RE =
  process.env.HERMES_FLEET_DEAD_MODELS_RE ||
  '^(glm-coding|glm-5\\.2|glm-5|glm-47|glm-4\\.7|glm-5-turbo|z-ai/glm-5\\.2)$';

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

/**
 * SuperGrok / hermes-yolo route receipts (history.jsonl) — NOT in LiteLLM traffic.jsonl.
 * Without this, a healthy SuperGrok path can never lift fleet-health while glm empty
 * responses dominate the LiteLLM log (2026-08-05).
 *
 * @param {string} historyPath
 * @param {{ windowHours?: number }} options
 * @returns {object[]} enriched metrics compatible with summarize()
 */
function loadGrokReceipts(historyPath = DEFAULT_GROK_RECEIPT_HISTORY, options = {}) {
  if (!historyPath || !fs.existsSync(historyPath)) return [];
  const windowHours = Number(options.windowHours || 0);
  const cutoff = windowHours > 0 ? Date.now() - windowHours * 3600 * 1000 : 0;
  let text;
  try {
    text = readLogTail(historyPath, Number(options.maxBytes || 2 * 1024 * 1024));
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      const route = rec.route || {};
      const exec = rec.execution || {};
      const generatedAt = rec.generatedAt || null;
      if (cutoff && generatedAt) {
        const ts = Date.parse(generatedAt);
        if (!Number.isFinite(ts) || ts < cutoff) continue;
      }
      // Only SuperGrok / grok backend receipts (skip hermes-legacy noise)
      const backend = String(route.selectedBackend || '');
      const model = String(route.actualModel || route.model || backend || 'unknown');
      if (!/grok/i.test(backend) && !/grok/i.test(model) && !/grok/i.test(String(route.launcher || ''))) {
        continue;
      }
      const status =
        exec.status === 'pass' || exec.exitCode === 0
          ? 'success'
          : exec.status === 'fail' || exec.status === 'blocked'
            ? 'failure'
            : 'unknown';
      const latencyS = Number(exec.durationMs || 0) / 1000;
      out.push(
        enrichRecord({
          model,
          status,
          latency_s: latencyS,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          ts_end: generatedAt,
          messages: [{ role: 'user', content: 'hermes-yolo SuperGrok route' }],
          tools_offered: false,
          has_tool_calls: false,
          source: 'hermes-yolo-receipt',
        }),
      );
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * Merge LiteLLM traffic + SuperGrok receipts. Optionally drop known-dead models
 * from the grade (they are still reported under droppedDead).
 *
 * @param {{ windowHours?: number, logPath?: string, receiptPath?: string, dropDeadModels?: boolean, deadModelRe?: string|RegExp }} options
 */
function loadFleetMetrics(options = {}) {
  const windowHours = options.windowHours === undefined ? 6 : Number(options.windowHours);
  const logPath = options.logPath || DEFAULT_LOG;
  const receiptPath = options.receiptPath || DEFAULT_GROK_RECEIPT_HISTORY;
  const dropDead =
    options.dropDeadModels !== undefined
      ? Boolean(options.dropDeadModels)
      : process.env.HERMES_FLEET_DROP_DEAD !== '0';
  const deadRe = new RegExp(options.deadModelRe || DEFAULT_DEAD_MODEL_RE, 'i');

  const litellm = loadTraffic(logPath, { windowHours });
  const grok = loadGrokReceipts(receiptPath, { windowHours });
  const merged = [...litellm, ...grok];
  const droppedDead = [];
  const kept = [];
  for (const m of merged) {
    if (dropDead && deadRe.test(String(m.model || ''))) droppedDead.push(m);
    else kept.push(m);
  }
  return {
    metrics: kept,
    litellmN: litellm.length,
    grokN: grok.length,
    droppedDeadN: droppedDead.length,
    droppedDeadModels: [...new Set(droppedDead.map((m) => m.model))],
  };
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
  DEFAULT_GROK_RECEIPT_HISTORY,
  DEFAULT_DEAD_MODEL_RE,
  enrichRecord,
  loadTraffic,
  loadGrokReceipts,
  loadFleetMetrics,
  summarize,
  firstUserText,
  parseLogTs,
  readLogTail,
};
