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
const { execSync, spawnSync } = require('child_process');
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

// Retrieval quality — MEASURED by invoking the real eval over the production
// backends (lexical repo retrieval + ThumbGate lessons store, each scored with
// recall@k and MRR by tools/rag-retrieval-eval.js). The optional grepai leg is
// skipped here: the floor below is defined over lexical+lessons, and grepai can
// add up to 5×20s of timeout to every suite run.
const RETRIEVAL_RECALL_FLOOR = 0.6;
// One eval run per root per process: the eval spawns real retrievals over the
// whole corpus, and the suite is invoked repeatedly by its tests.
const retrievalRecallCache = new Map();

function measureRetrievalRecall(root) {
  if (!retrievalRecallCache.has(root)) {
    retrievalRecallCache.set(root, computeRetrievalRecall(root));
  }
  return retrievalRecallCache.get(root);
}

function computeRetrievalRecall(root) {
  const script = path.join(root, 'tools', 'rag-retrieval-eval.js');
  if (!fs.existsSync(script)) return unmeasured('tools/rag-retrieval-eval.js not present');
  const run = spawnSync(process.execPath, [script, '--json', '--no-grepai'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.error) return unmeasured(`retrieval eval failed to run: ${run.error.message}`);
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    const detail = (run.stderr || run.stdout || '').trim().slice(0, 200);
    return unmeasured(`retrieval eval emitted no JSON (exit ${run.status}): ${detail}`);
  }
  const lexical = report.backends && report.backends.lexical;
  const lessons = report.backends && report.backends.lessons;
  const combined = report.combined;
  if (!lexical || !combined) return unmeasured('retrieval eval JSON carries no backends.lexical/combined');
  const lessonsAvailable = Boolean(lessons && lessons.available);
  return {
    measured: true,
    source: 'tools/rag-retrieval-eval.js --json --no-grepai',
    lexicalMeanRecallAtK: lexical.meanRecallAtK,
    lexicalMeanMRR: lexical.meanMRR,
    lessonsAvailable,
    ...(lessonsAvailable
      ? { lessonsMeanRecallAtK: lessons.meanRecallAtK, lessonsMeanMRR: lessons.meanMRR }
      : { lessonsUnavailableReason: (lessons && lessons.reason) || 'lessons backend missing from report' }),
    combinedMeanRecallAtK: combined.meanRecallAtK,
    combinedMeanMRR: combined.meanMRR,
    combinedCaseCount: combined.caseCount,
    floor: RETRIEVAL_RECALL_FLOOR,
    belowFloor: combined.meanRecallAtK < RETRIEVAL_RECALL_FLOOR,
  };
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
    retrievalRecall: measureRetrievalRecall(root),

    // Deliberately declared-but-unmeasured. These are the ones that used to be
    // fabricated. They stay listed so the gap is visible in the report rather
    // than quietly dropped — each is real work, not a constant.
    offlineAccuracy: unmeasured('no versioned eval dataset exists yet'),
    llmAsAJudge: unmeasured('no judge implemented; groundedness/helpfulness were literals'),
  };

  const gaps = Object.entries(metrics)
    .filter(([, v]) => v && v.measured === false)
    .map(([k, v]) => `${k}: ${v.reason}`);
  // A measured retrieval score can still be a gap: below the floor it is a
  // quality regression, and an unavailable lessons backend means the production
  // memory-retrieval path went unmeasured on this machine.
  const rr = metrics.retrievalRecall;
  if (rr.measured) {
    if (rr.belowFloor) {
      gaps.push(`retrievalRecall: combined lexical+lessons recall@k ${rr.combinedMeanRecallAtK} is below the ${rr.floor} floor`);
    }
    if (!rr.lessonsAvailable) {
      gaps.push(`retrievalRecall: lessons backend unmeasured — ${rr.lessonsUnavailableReason}`);
    }
  }

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
    console.log('\n-- gaps: unmeasured or below floor (never report these as passing) --');
    for (const gap of res.unmeasured) console.log(`  ${gap}`);
    console.log('');
  }
}

module.exports = { runEvalBenchmarkSuite };
