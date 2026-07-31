#!/usr/bin/env node
'use strict';

/**
 * Eval benchmark suite — reports ONLY what it actually measures.
 *
 * History: earlier versions fabricated groundednessScore: 0.98 and vendor
 * parity claims. Rule: every metric carries measured + source, or
 * measured:false with a reason.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { exportDpoPairs } = require('./export-dpo-benchmark-pairs');

function unmeasured(reason) {
  return { measured: false, reason };
}

function runJsonTool(root, script, extraArgs = [], timeout = 180000) {
  const full = path.join(root, 'tools', script);
  if (!fs.existsSync(full)) return unmeasured(`missing tools/${script}`);
  const run = spawnSync(process.execPath, [full, ...extraArgs], {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.error) return unmeasured(`${script} failed: ${run.error.message}`);
  try {
    return { measured: true, source: `tools/${script}`, ...JSON.parse(run.stdout) };
  } catch {
    return unmeasured(`${script} emitted no JSON (exit ${run.status}): ${(run.stderr || run.stdout || '').slice(0, 160)}`);
  }
}

function readHumanFeedback(summaryPath) {
  if (!fs.existsSync(summaryPath)) return unmeasured(`no feedback summary at ${summaryPath}`);
  try {
    const d = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const total = Number(d.total);
    const positive = Number(d.positive);
    const negative = Number(d.negative);
    if (!Number.isFinite(total) || total < 0) return unmeasured('feedback summary lacks total');
    return {
      measured: true,
      source: summaryPath,
      total,
      positive: Number.isFinite(positive) ? positive : null,
      negative: Number.isFinite(negative) ? negative : null,
      thumbsUpRatePct:
        total > 0 && Number.isFinite(positive) ? Number(((100 * positive) / total).toFixed(2)) : null,
    };
  } catch (error) {
    return unmeasured(`feedback summary unreadable: ${error.message}`);
  }
}

function runEvalBenchmarkSuite(options = {}) {
  const root = options.cwd || process.cwd();
  const home = options.home || process.env.HOME || '';
  const startTime = Date.now();

  let dpoPairs;
  try {
    const dpoExport = exportDpoPairs({ cwd: root });
    dpoPairs = { measured: true, source: 'export-dpo-benchmark-pairs', exported: dpoExport.totalExported };
  } catch (err) {
    dpoPairs = unmeasured(`DPO export failed: ${err.message}`);
  }

  const retrieval = runJsonTool(root, 'rag-retrieval-eval.js', ['--json']);
  const generation = runJsonTool(root, 'rag-generation-eval.js', ['--json'], 30000);

  const metrics = {
    retrieval: retrieval.measured
      ? {
          measured: true,
          source: retrieval.source,
          ok: retrieval.ok,
          meanRecallAtK: retrieval.meanRecallAtK,
          meanPrecisionAtK: retrieval.meanPrecisionAtK,
          meanMRR: retrieval.meanMRR,
          meanNdcgAtK: retrieval.meanNdcgAtK ?? retrieval.meanNDCGAtK,
          caseCount: retrieval.caseCount,
          passCount: retrieval.passCount,
        }
      : retrieval,
    generation: generation.measured
      ? {
          measured: true,
          source: generation.source,
          ok: generation.ok,
          meanAnswerRelevance: generation.meanAnswerRelevance,
          meanFaithfulness: generation.meanFaithfulness,
          meanGroundedness: generation.meanGroundedness,
          caseCount: generation.caseCount,
          passCount: generation.passCount,
        }
      : generation,
    humanFeedback: readHumanFeedback(path.join(home, '.thumbgate', 'feedback-summary.json')),
    dpoPairs,
  };

  const gaps = Object.entries(metrics)
    .filter(([, v]) => v && v.measured === false)
    .map(([k, v]) => `${k}: ${v.reason}`);
  if (metrics.retrieval.measured && !metrics.retrieval.ok) {
    gaps.push('retrieval: fixture cases failed (recall/precision/MRR/nDCG)');
  }
  if (metrics.generation.measured && !metrics.generation.ok) {
    gaps.push('generation: faithfulness/groundedness/relevance cases failed');
  }

  return {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    metrics,
    unmeasured: gaps,
  };
}

if (require.main === module) {
  const res = runEvalBenchmarkSuite();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log('\n=== HERMES EVAL BENCHMARK SUITE (measured only) ===');
    console.log(`Timestamp: ${res.timestamp}`);
    for (const [k, v] of Object.entries(res.metrics)) {
      if (v.measured) {
        const { measured, source, ...rest } = v;
        console.log(`  OK ${k}: ${Object.entries(rest).map(([a, b]) => `${a}=${b}`).join(' ')}`);
      } else {
        console.log(`  GAP ${k}: ${v.reason}`);
      }
    }
    if (res.unmeasured.length) {
      console.log('\n-- gaps --');
      for (const g of res.unmeasured) console.log(`  - ${g}`);
    }
  }
  const hardFail =
    (res.metrics.retrieval.measured && !res.metrics.retrieval.ok) ||
    (res.metrics.generation.measured && !res.metrics.generation.ok);
  process.exit(hardFail ? 1 : 0);
}

module.exports = { runEvalBenchmarkSuite };
