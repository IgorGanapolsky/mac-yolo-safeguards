#!/usr/bin/env node
'use strict';

/**
 * Live fleet health — grades real traffic (LiteLLM + SuperGrok receipts).
 *
 * Design scorecard (scorecard.js) is separate — never conflate.
 *
 * SuperGrok one-shots go through grok-yolo and never appear in traffic.jsonl.
 * Without dual-source, fleet grade could stay C/D while SuperGrok is healthy
 * and only dead glm empty-completions dominate LiteLLM.
 *
 *   node tools/inference-eng/fleet-health.js
 *   node tools/inference-eng/fleet-health.js --json --gate
 *   node tools/inference-eng/fleet-health.js --include-dead  # do not drop glm-coding
 *
 * Exit 1 with --gate when successRate < floor (default 0.5) or n=0.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadFleetMetrics, summarize } = require('./metrics');
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
  const dropDeadModels =
    options.dropDeadModels !== undefined ? Boolean(options.dropDeadModels) : true;

  const fleet = loadFleetMetrics({
    windowHours,
    logPath,
    receiptPath: options.receiptPath,
    dropDeadModels,
  });
  const metrics = fleet.metrics;
  const summary = summarize(metrics);
  const successRate = summary.successRate;
  const n = summary.n;
  const g = gradeFleet(successRate, n);
  const mode = inferMode({
    recentFailRate: successRate == null ? 1 : 1 - successRate,
    swapUsedPct: options.swapUsedPct,
    env: options.env || process.env,
  });
  const routeEnv = options.env !== undefined ? options.env : process.env;
  const codingRoute = selectModelChain({
    taskText: 'fix the production bug',
    mode,
    env: routeEnv,
  });
  const opt = runOptimizer({ windowHours, logPath });

  // Coding path = SuperGrok receipts only (hermes-yolo → grok-yolo). This is the
  // intentional primary after SuperGrok restore; LiteLLM free/glm thrash is gateway noise.
  const codingMetrics = metrics.filter((m) => /grok/i.test(String(m.model || '')));
  const codingSummary = summarize(codingMetrics);
  const codingGrade = gradeFleet(codingSummary.successRate, codingSummary.n);

  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    logPath,
    sources: {
      litellmN: fleet.litellmN,
      grokReceiptN: fleet.grokN,
      droppedDeadN: fleet.droppedDeadN,
      droppedDeadModels: fleet.droppedDeadModels,
      dropDeadModels,
    },
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
    codingPath: {
      n: codingSummary.n,
      ok: codingSummary.ok,
      fail: codingSummary.fail,
      successRate: codingSummary.successRate,
      grade: codingGrade.grade,
      score: codingGrade.score,
      aPlus: codingGrade.grade === 'A+' && codingSummary.n >= 10,
      tenOfTen: codingGrade.score === 10 && codingSummary.n >= 10,
      note: 'SuperGrok/hermes-yolo receipts only — coding primary surface',
    },
    note:
      'LIVE dual-source grade (LiteLLM traffic.jsonl + SuperGrok hermes-yolo receipts). ' +
      'Not tools/inference-eng/scorecard.js (control-plane design). ' +
      (dropDeadModels
        ? 'Known-dead glm quota models dropped from grade (see sources.droppedDead*).'
        : 'Including dead models (--include-dead).'),
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
  let dropDeadModels = true;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--gate') gate = true;
    else if (argv[i] === '--window-hours') windowHours = Number(argv[++i] || 6);
    else if (argv[i] === '--floor') floor = Number(argv[++i] || 0.5);
    else if (argv[i] === '--include-dead') dropDeadModels = false;
  }
  const report = assess({ windowHours, dropDeadModels });
  writeState(report);
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    console.log(
      `Fleet health (${windowHours}h): grade=${report.grade} score=${report.score}/10 ` +
        `n=${report.n} success=${report.successRate == null ? 'n/a' : (report.successRate * 100).toFixed(1) + '%'} ` +
        `mode→${report.recommendedMode} primary→${report.recommendedCodingPrimary}`,
    );
    console.log(
      `  sources litellm=${report.sources.litellmN} grok=${report.sources.grokReceiptN} ` +
        `droppedDead=${report.sources.droppedDeadN}${
          report.sources.droppedDeadModels.length
            ? ` (${report.sources.droppedDeadModels.join(',')})`
            : ''
        }`,
    );
    if (report.codingPath) {
      console.log(
        `  codingPath: grade=${report.codingPath.grade} score=${report.codingPath.score}/10 ` +
          `n=${report.codingPath.n} success=${
            report.codingPath.successRate == null
              ? 'n/a'
              : (report.codingPath.successRate * 100).toFixed(1) + '%'
          } aPlus=${report.codingPath.aPlus}`,
      );
    }
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
