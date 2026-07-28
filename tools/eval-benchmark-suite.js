#!/usr/bin/env node
'use strict';

// Eval benchmark suite — reports ONLY what it actually measures.
//
// History (2026-07-28): this file used to emit a report that looked like a
// best-in-class eval stack and was almost entirely literals:
//   accuracyPct: 100        over a "50 prompt" dataset that does not exist
//   groundednessScore: 0.98 / helpfulnessScore: 0.96 with NO judge in the code
//   thumbsUpRatePct: 100    while never reading the feedback store — the real
//                           rate from ~/.thumbgate/feedback-summary.json was
//                           678/1639 = 41.4%
//   domainMetrics: { revenuePipelineHealthy: true } while external revenue is $0
// plus prose asserting parity with LangSmith / OpenAI Evals / Arize Phoenix /
// Braintrust / W&B Weave. Only four values were ever computed. A number that is
// always 98% is worse than no number: it launders confidence and will report
// health on the day the system is broken.
//
// Rule for this file: every metric carries `measured`, and a measured one carries
// `source`. If it was not computed from a real artifact this run it is
// `measured:false` with a reason — never a plausible-looking constant.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { exportDpoPairs } = require('./export-dpo-benchmark-pairs');

function unmeasured(reason) {
  return { measured: false, reason };
}

// Real human labels: ThumbGate's feedback store. This is the one genuine quality
// signal the fleet has, and the old suite hardcoded it to 100%.
function readHumanFeedback(summaryPath) {
  if (!fs.existsSync(summaryPath)) return unmeasured(`no feedback summary at ${summaryPath}`);
  try {
    const d = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const total = Number(d.total);
    const positive = Number(d.positive);
    const negative = Number(d.negative);
    if (!Number.isFinite(total) || !Number.isFinite(positive) || total <= 0) {
      return unmeasured('feedback summary present but malformed');
    }
    return {
      measured: true,
      source: summaryPath,
      total,
      positive,
      negative: Number.isFinite(negative) ? negative : null,
      // A real rate, not a target. Rounded to one decimal.
      thumbsUpRatePct: Math.round((positive / total) * 1000) / 10,
    };
  } catch (err) {
    return unmeasured(`feedback summary unreadable: ${err.message}`);
  }
}

// An ABSENT store is not "zero rules". The old code silently reported 0 for a
// file that does not exist on this machine at all.
function readPreventionRules(memoriesPath) {
  if (!fs.existsSync(memoriesPath)) return unmeasured(`no prevention-rule store at ${memoriesPath}`);
  try {
    const data = JSON.parse(fs.readFileSync(memoriesPath, 'utf8'));
    return { measured: true, source: memoriesPath, activeCount: Array.isArray(data) ? data.length : 0 };
  } catch (err) {
    return unmeasured(`prevention-rule store unreadable: ${err.message}`);
  }
}

// This is a unit test, not an "eval" — named for what it is.
function runConnectorUnitTest(root) {
  const p = path.join(root, 'tests', 'test-hermes-cloud-connector.js');
  if (!fs.existsSync(p)) return unmeasured('connector test not present');
  try {
    execSync(`node --test "${p}"`, { stdio: 'ignore', timeout: 30000 });
    return { measured: true, source: p, status: 'pass' };
  } catch {
    return { measured: true, source: p, status: 'fail' };
  }
}

function readContinuousE2E(root) {
  const p = path.join(root, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json');
  if (!fs.existsSync(p)) return unmeasured('no continuous E2E proof on disk');
  try {
    const proof = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!proof.status) return unmeasured('E2E proof present but carries no status');
    return { measured: true, source: p, status: proof.status };
  } catch (err) {
    return unmeasured(`E2E proof unreadable: ${err.message}`);
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

  const metrics = {
    connectorUnitTest: runConnectorUnitTest(root),
    preventionRules: readPreventionRules(path.join(home, '.thumbgate', 'memories.json')),
    continuousE2E: readContinuousE2E(root),
    humanFeedback: readHumanFeedback(path.join(home, '.thumbgate', 'feedback-summary.json')),
    dpoPairs,

    // Deliberately declared-but-unmeasured. These are the ones that used to be
    // fabricated. They stay listed so the gap is visible in the report rather
    // than quietly dropped — each is real work, not a constant.
    offlineAccuracy: unmeasured('no versioned eval dataset exists yet'),
    llmAsAJudge: unmeasured('no judge implemented; groundedness/helpfulness were literals'),
    retrievalRecall: unmeasured('run tools/rag-retrieval-eval.js — it computes real recall@k'),
  };

  const gaps = Object.entries(metrics)
    .filter(([, v]) => v && v.measured === false)
    .map(([k, v]) => `${k}: ${v.reason}`);

  return {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    metrics,
    unmeasured: gaps,
    // No framework-parity claims. Comparing this to LangSmith/Braintrust/Arize
    // requires demonstrating the capability, not asserting it in a string.
  };
}

function fmt(name, m) {
  const { measured, source, reason, ...rest } = m;
  const body = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(' ');
  return `${name}: ${body}`;
}

if (require.main === module) {
  const res = runEvalBenchmarkSuite();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log('\n=== HERMES EVAL BENCHMARK SUITE ===');
    console.log(`Timestamp: ${res.timestamp}`);
    console.log('\n-- measured --');
    for (const [k, v] of Object.entries(res.metrics)) {
      if (v && v.measured) console.log(`  ${fmt(k, v)}`);
    }
    console.log('\n-- NOT measured (never report these as passing) --');
    for (const gap of res.unmeasured) console.log(`  ${gap}`);
    console.log('');
  }
}

module.exports = { runEvalBenchmarkSuite };
