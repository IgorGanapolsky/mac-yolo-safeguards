#!/usr/bin/env node
'use strict';

/**
 * Live fleet health — grades real traffic.jsonl, not the static scorecard.
 *
 *   node tools/inference-eng/fleet-health.js
 *   node tools/inference-eng/fleet-health.js --json --gate
 *
 * Exit 1 with --gate when successRate < floor (default 0.5) or n=0.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadTraffic, summarize } = require('./metrics');
const { inferMode, selectModelChain } = require('./degradation');
const { runOptimizer } = require('./optimizer');

const DEFAULT_LOG = path.join(os.homedir(), '.hermes', 'litellm-logs', 'traffic.jsonl');
const STATE_PATH =
  process.env.HERMES_FLEET_HEALTH_STATE ||
  path.join(os.homedir(), '.hermes', 'inference-eng', 'fleet-health-latest.json');

function gradeFleet(successRate, n) {
  if (!n) return { grade: 'I', score: 0, label: 'insufficient_data' };
  if (successRate >= 0.95) return { grade: 'A+', score: 10, label: 'excellent' };
  if (successRate >= 0.9) return { grade: 'A', score: 9, label: 'strong' };
  if (successRate >= 0.8) return { grade: 'B+', score: 8, label: 'good' };
  if (successRate >= 0.7) return { grade: 'B', score: 7, label: 'ok' };
  if (successRate >= 0.5) return { grade: 'C', score: 5, label: 'degraded' };
  if (successRate >= 0.3) return { grade: 'D', score: 3, label: 'poor' };
  return { grade: 'F', score: 1, label: 'failing' };
}

function assess(options = {}) {
  const windowHours =
    options.windowHours === undefined || options.windowHours === null
      ? 6
      : Number(options.windowHours);
  const logPath = options.logPath || DEFAULT_LOG;
  const metrics = loadTraffic(logPath, { windowHours });
  const summary = summarize(metrics);
  const successRate = summary.successRate;
  const n = summary.n;
  const g = gradeFleet(successRate, n);
  const mode = inferMode({
    recentFailRate: successRate == null ? 1 : 1 - successRate,
    swapUsedPct: options.swapUsedPct,
    env: options.env || process.env,
  });
  // Prefer live process env so SuperGrok backend pin / stale glm pin are visible,
  // unless caller overrides (tests pass env: {}).
  const routeEnv = options.env !== undefined ? options.env : process.env;
  const codingRoute = selectModelChain({
    taskText: 'fix the production bug',
    mode,
    env: routeEnv,
  });
  const opt = runOptimizer({ windowHours, logPath });

  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    logPath,
    n,
    ok: summary.ok,
    fail: summary.fail,
    successRate,
    meanLatencyS: summary.meanLatencyS,
    budgetHitRate: summary.budgetHitRate,
    grade: g.grade,
    score: g.score,
    label: g.label,
    recommendedMode: mode,
    recommendedCodingPrimary: codingRoute.primary,
    recommendedChain: codingRoute.chain,
    byModel: summary.byModel,
    byTask: summary.byTask,
    optimizerProposals: (opt.proposals || []).slice(0, 8),
    aPlus: g.grade === 'A+' && n >= 10,
    tenOfTen: g.score === 10 && n >= 10,
    note:
      'This grades LIVE traffic, not tools/inference-eng/scorecard.js (control-plane design).',
  };
}

function writeState(report) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true, mode: 0o700 });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return STATE_PATH;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let json = false;
  let gate = false;
  let windowHours = 6;
  let floor = 0.5;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--gate') gate = true;
    else if (argv[i] === '--window-hours') windowHours = Number(argv[++i] || 6);
    else if (argv[i] === '--floor') floor = Number(argv[++i] || 0.5);
  }
  const report = assess({ windowHours });
  writeState(report);
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    console.log(
      `Fleet health (${windowHours}h): grade=${report.grade} score=${report.score}/10 ` +
        `n=${report.n} success=${report.successRate == null ? 'n/a' : (report.successRate * 100).toFixed(1) + '%'} ` +
        `mode→${report.recommendedMode} primary→${report.recommendedCodingPrimary}`,
    );
    console.log(`  ${report.note}`);
    for (const p of report.optimizerProposals.slice(0, 5)) {
      console.log(`  opt[${p.severity}] ${p.kind}: ${(p.detail || p.action || '').slice(0, 100)}`);
    }
  }
  if (gate) {
    if (!report.n || report.successRate == null || report.successRate < floor) process.exit(1);
  }
  process.exit(0);
}

module.exports = {
  assess,
  gradeFleet,
  writeState,
  DEFAULT_LOG,
  STATE_PATH,
};
