#!/usr/bin/env node
'use strict';

/**
 * Per-LLM-call observability layer for ThumbGate / Hermes.
 *
 * Records every LLM call with: provider, model, token usage (prompt/completion),
 * cost, latency, route, organization, traceId, and success/error status.
 *
 * Output: ~/.hermes/llm-calls.jsonl (one JSON object per call)
 * Query: node tools/hermes-llm-observability.js --summary
 *        node tools/hermes-llm-observability.js --by-model
 *        node tools/hermes-llm-observability.js --by-org
 *
 * This is the logging/replay layer — no secrets, no prompt/response bodies.
 * Privacy: only records metadata, never the prompt or completion text.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_PATH = path.join(os.homedir(), '.hermes', 'llm-calls.jsonl');
const PRICING = {
  // Per-million-token pricing (USD). Update as providers change.
  'qwen2.5:3b-64k': { input: 0, output: 0 },
  'gpt-oss:20b': { input: 0, output: 0 },
  'glm-5.2': { input: 0.93, output: 3.0 },
  'grok-4.5': { input: 2.0, cachedInput: 0.5, output: 6.0 },
  'anthropic/claude-sonnet-5': { input: 2.0, output: 10.0 },
  'sakana/fugu-ultra': { input: 5.0, output: 30.0 },
  'openrouter/advisor': { input: 0.5, output: 2.0 },
  'openrouter/subagent': { input: 0.3, output: 1.0 },
  'openrouter/fusion': { input: 1.0, output: 4.0 },
  'nvidia/nemotron-3-ultra-550b-a55b': { input: 0.5, output: 2.0 },
  'search-v1': { input: 0, output: 0 },
};

function ensureLogDir() {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Log a single LLM call.
 *
 * @param {object} params
 * @param {string} params.provider - e.g. 'custom:ollama-local-64k', 'openrouter'
 * @param {string} params.model - e.g. 'glm-5.2', 'qwen2.5:3b-64k'
 * @param {string} params.route - e.g. 'local_fast', 'glm52_reasoning'
 * @param {string} [params.organizationId] - org scope for multi-tenant
 * @param {string} [params.traceId] - correlates to task traceId
 * @param {number} params.promptTokens - input token count
 * @param {number} params.completionTokens - output token count
 * @param {number} [params.cachedPromptTokens] - cached input tokens (discount)
 * @param {number} params.latencyMs - wall-clock latency
 * @param {boolean} params.success - whether the call succeeded
 * @param {string} [params.error] - error message if failed
 * @param {number[]} [params.retrievalScores] - top-k retrieval scores for this call
 * @param {number} [params.timestamp] - override timestamp (ms since epoch)
 * @returns {object} the logged record
 */
function logLLMCall(params) {
  if (!params.provider || !params.model) {
    throw new Error('logLLMCall requires provider and model');
  }
  if (typeof params.promptTokens !== 'number' || typeof params.completionTokens !== 'number') {
    throw new Error('logLLMCall requires promptTokens and completionTokens as numbers');
  }

  const pricing = PRICING[params.model] || { input: 0, output: 0 };
  const effectiveInputTokens = params.promptTokens - (params.cachedPromptTokens || 0);
  const costUsd =
    (effectiveInputTokens / 1_000_000) * (pricing.input || 0) +
    (params.cachedPromptTokens || 0) / 1_000_000 * (pricing.cachedInput || pricing.input || 0) +
    (params.completionTokens / 1_000_000) * (pricing.output || 0);

  const record = {
    timestamp: params.timestamp || Date.now(),
    provider: params.provider,
    model: params.model,
    route: params.route || 'unknown',
    organizationId: params.organizationId || null,
    traceId: params.traceId || null,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    cachedPromptTokens: params.cachedPromptTokens || 0,
    totalTokens: params.promptTokens + params.completionTokens,
    costUsd: Number(costUsd.toFixed(6)),
    latencyMs: params.latencyMs,
    success: params.success,
    error: params.error || null,
    retrievalScores: params.retrievalScores || null,
  };

  ensureLogDir();
  fs.appendFileSync(LOG_PATH, JSON.stringify(record) + '\n');
  return record;
}

/**
 * Read all logged LLM calls.
 * @param {object} options - { since: ms timestamp, limit: max records }
 * @returns {object[]}
 */
function readLLMCalls(options = {}) {
  if (!fs.existsSync(LOG_PATH)) return [];
  const text = fs.readFileSync(LOG_PATH, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  let records = lines.map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  if (options.since) {
    records = records.filter((r) => r.timestamp >= options.since);
  }
  if (options.limit) {
    records = records.slice(-options.limit);
  }
  return records;
}

/**
 * Compute aggregate metrics from logged calls.
 */
function summarize(records) {
  if (records.length === 0) {
    return {
      totalCalls: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      successRate: 0,
      byModel: {},
      byRoute: {},
      byOrg: {},
    };
  }

  const totalTokens = records.reduce((s, r) => s + (r.totalTokens || 0), 0);
  const totalCost = records.reduce((s, r) => s + (r.costUsd || 0), 0);
  const totalLatency = records.reduce((s, r) => s + (r.latencyMs || 0), 0);
  const successes = records.filter((r) => r.success).length;

  const byModel = {};
  const byRoute = {};
  const byOrg = {};

  for (const r of records) {
    const model = r.model || 'unknown';
    if (!byModel[model]) byModel[model] = { calls: 0, tokens: 0, costUsd: 0, avgLatencyMs: 0 };
    byModel[model].calls += 1;
    byModel[model].tokens += r.totalTokens || 0;
    byModel[model].costUsd += r.costUsd || 0;
    byModel[model].avgLatencyMs += r.latencyMs || 0;

    const route = r.route || 'unknown';
    if (!byRoute[route]) byRoute[route] = { calls: 0, tokens: 0, costUsd: 0, errors: 0 };
    byRoute[route].calls += 1;
    byRoute[route].tokens += r.totalTokens || 0;
    byRoute[route].costUsd += r.costUsd || 0;
    if (!r.success) byRoute[route].errors += 1;

    const org = r.organizationId || 'unscoped';
    if (!byOrg[org]) byOrg[org] = { calls: 0, tokens: 0, costUsd: 0 };
    byOrg[org].calls += 1;
    byOrg[org].tokens += r.totalTokens || 0;
    byOrg[org].costUsd += r.costUsd || 0;
  }

  // Finalize averages
  for (const m of Object.keys(byModel)) {
    byModel[m].avgLatencyMs = byModel[m].calls > 0
      ? Number((byModel[m].avgLatencyMs / byModel[m].calls).toFixed(0))
      : 0;
    byModel[m].costUsd = Number(byModel[m].costUsd.toFixed(4));
  }
  for (const r of Object.keys(byRoute)) {
    byRoute[r].costUsd = Number(byRoute[r].costUsd.toFixed(4));
  }
  for (const o of Object.keys(byOrg)) {
    byOrg[o].costUsd = Number(byOrg[o].costUsd.toFixed(4));
  }

  return {
    totalCalls: records.length,
    totalTokens,
    totalCostUsd: Number(totalCost.toFixed(4)),
    avgLatencyMs: Math.round(totalLatency / records.length),
    successRate: Number((successes / records.length * 100).toFixed(1)),
    byModel,
    byRoute,
    byOrg,
  };
}

function formatSummaryTable(summary) {
  const lines = [];
  lines.push('=== LLM Observability Summary ===');
  lines.push(`Total calls: ${summary.totalCalls}`);
  lines.push(`Total tokens: ${summary.totalTokens.toLocaleString()}`);
  lines.push(`Total cost: $${summary.totalCostUsd.toFixed(4)}`);
  lines.push(`Avg latency: ${summary.avgLatencyMs}ms`);
  lines.push(`Success rate: ${summary.successRate}%`);
  lines.push('');
  lines.push('--- By Model ---');
  for (const [model, stats] of Object.entries(summary.byModel).sort((a, b) => b[1].costUsd - a[1].costUsd)) {
    lines.push(`  ${model}: ${stats.calls} calls, ${(stats.tokens / 1000).toFixed(1)}k tok, $${stats.costUsd.toFixed(4)}, ${stats.avgLatencyMs}ms avg`);
  }
  lines.push('');
  lines.push('--- By Route ---');
  for (const [route, stats] of Object.entries(summary.byRoute).sort((a, b) => b[1].calls - a[1].calls)) {
    lines.push(`  ${route}: ${stats.calls} calls, $${stats.costUsd.toFixed(4)}, ${stats.errors} errors`);
  }
  if (Object.keys(summary.byOrg).length > 1 || (Object.keys(summary.byOrg).length === 1 && !summary.byOrg.unscoped)) {
    lines.push('');
    lines.push('--- By Organization ---');
    for (const [org, stats] of Object.entries(summary.byOrg).sort((a, b) => b[1].costUsd - a[1].costUsd)) {
      const orgLabel = org === 'unscoped' ? 'unscoped' : `${org.slice(0, 8)}…`;
      lines.push(`  ${orgLabel}: ${stats.calls} calls, $${stats.costUsd.toFixed(4)}`);
    }
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const since24h = args.includes('--24h');
  const since7d = args.includes('--7d');
  const json = args.includes('--json');
  const byModel = args.includes('--by-model');
  const byOrg = args.includes('--by-org');

  let since = null;
  if (since24h) since = Date.now() - 24 * 60 * 60 * 1000;
  if (since7d) since = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const records = readLLMCalls({ since });
  const summary = summarize(records);

  if (json) {
    if (byModel) {
      console.log(JSON.stringify(summary.byModel, null, 2));
    } else if (byOrg) {
      console.log(JSON.stringify(summary.byOrg, null, 2));
    } else {
      console.log(JSON.stringify(summary, null, 2));
    }
  } else {
    console.log(formatSummaryTable(summary));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  logLLMCall,
  readLLMCalls,
  summarize,
  formatSummaryTable,
  PRICING,
  LOG_PATH,
};
