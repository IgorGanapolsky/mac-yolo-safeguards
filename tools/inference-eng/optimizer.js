#!/usr/bin/env node
'use strict';

/**
 * Self-optimization loop (playbook §6):
 * read traffic → find slowest/most expensive/failing tasks → propose remaps.
 *
 * Does NOT auto-apply to production; writes proposals JSON for human/agent PR.
 *
 *   node tools/inference-eng/optimizer.js --json
 *   node tools/inference-eng/optimizer.js --window-hours 24
 */

const fs = require('fs');
const path = require('path');
const { loadTraffic, summarize } = require('./metrics');
const { getTask } = require('./task-registry');
const { selectModelChain } = require('./degradation');

/**
 * @param {ReturnType<typeof summarize>} summary
 * @returns {object[]} proposals
 */
function propose(summary) {
  const proposals = [];
  if (!summary || !summary.n) {
    return [
      {
        kind: 'insufficient_data',
        severity: 'info',
        action: 'collect_more_traffic',
        detail: 'No traffic rows in window — run agents then re-optimize',
      },
    ];
  }

  if (summary.successRate != null && summary.successRate < 0.7) {
    proposals.push({
      kind: 'high_failure_rate',
      severity: 'critical',
      action: 'set_mode_degraded_or_emergency',
      detail: `successRate=${(summary.successRate * 100).toFixed(1)}% — prefer free/local or SuperGrok OAuth over dead paid cascade`,
      envHint: { HERMES_INFERENCE_MODE: summary.successRate < 0.4 ? 'emergency' : 'degraded' },
    });
  }

  for (const [taskId, v] of Object.entries(summary.byTask || {})) {
    const task = getTask(taskId);
    if (!task || !v.n) continue;
    const meanMs = (v.meanLatencyS || 0) * 1000;
    if (meanMs > task.latencyBudgetMs * 1.5 && v.n >= 3) {
      const cheaper = selectModelChain({ taskId, mode: 'degraded' });
      proposals.push({
        kind: 'latency_over_budget',
        severity: 'high',
        taskId,
        action: 'remap_to_faster_chain',
        detail: `task=${taskId} mean=${meanMs.toFixed(0)}ms budget=${task.latencyBudgetMs}ms`,
        proposedPrimary: cheaper.primary,
        proposedChain: cheaper.chain,
        businessKpi: task.businessKpi,
      });
    }
    if (v.failRate != null && v.failRate >= 0.4 && v.n >= 5) {
      proposals.push({
        kind: 'task_failure_hotspot',
        severity: 'high',
        taskId,
        action: 'rotate_primary_model',
        detail: `task=${taskId} failRate=${(v.failRate * 100).toFixed(0)}% n=${v.n}`,
        proposedPrimary: selectModelChain({
          taskId,
          mode: 'degraded',
          probeFailures: Object.entries(summary.byModel || {})
            .filter(([, m]) => m.failRate != null && m.failRate > 0.5)
            .map(([id]) => id),
        }).primary,
        businessKpi: task.businessKpi,
      });
    }
  }

  for (const [model, v] of Object.entries(summary.byModel || {})) {
    if (v.toolCompliance != null && v.toolCompliance < 0.5 && v.n >= 5) {
      proposals.push({
        kind: 'tool_noncompliance',
        severity: 'critical',
        model,
        action: 'remove_from_agent_primary',
        detail: `model=${model} toolCompliance=${(v.toolCompliance * 100).toFixed(0)}% — classic tiny/fallback non-tool model`,
      });
    }
  }

  if (proposals.length === 0) {
    proposals.push({
      kind: 'healthy',
      severity: 'info',
      action: 'maintain',
      detail: `n=${summary.n} success=${summary.successRate != null ? (summary.successRate * 100).toFixed(1) + '%' : 'n/a'} — no remap required`,
    });
  }

  return proposals;
}

function runOptimizer(options = {}) {
  const windowHours = Number(options.windowHours || 168);
  const logPath = options.logPath;
  const metrics = loadTraffic(logPath, { windowHours });
  const summary = summarize(metrics);
  const proposals = propose(summary);
  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    summary,
    proposals,
    abTestHint: {
      description: 'Route 10% of matching task traffic to proposedPrimary for 24h; compare successRate, meanLatencyS, costPer1kRuns',
      trafficSplit: 0.1,
      durationHours: 24,
    },
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let json = false;
  let windowHours = 168;
  let outPath = '';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--window-hours') windowHours = Number(argv[++i] || 168);
    else if (argv[i] === '--out') outPath = argv[++i] || '';
  }
  const report = runOptimizer({ windowHours });
  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    console.log(`Inference optimizer: n=${report.summary.n} proposals=${report.proposals.length}`);
    for (const p of report.proposals) {
      console.log(`  [${p.severity}] ${p.kind}: ${p.detail || p.action}`);
    }
  }
}

module.exports = {
  propose,
  runOptimizer,
};
