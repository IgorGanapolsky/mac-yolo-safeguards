#!/usr/bin/env node
'use strict';

/**
 * eval-benchmark-suite.js — report ONLY what was actually measured.
 *
 * WHAT THIS FILE USED TO DO
 *   It printed a five-line all-PASS report in which almost every number was a
 *   literal in the source:
 *
 *     offlineEvals:  { accuracyPct: 100, promptDatasetSize: 50 }   // both fabricated
 *     onlineEvals:   { thumbsUpRatePct: 100 }                      // real value: 41.3%
 *     llmAsAJudge:   { groundednessScore: 0.98, helpfulnessScore: 0.96 } // no model ever called
 *     domainMetrics: { codingTestsPassed: true, mobileE2EPassed: true,
 *                      revenuePipelineHealthy: true }              // hardcoded true
 *
 *   It printed "Regression Testing: [PASS] 0 active prevention rules" — PASS on
 *   a count of zero — and "Revenue Pipeline [PASS]" while external revenue was
 *   $0.00. It further claimed parity with LangSmith, OpenAI Evals, Arize
 *   Phoenix, Braintrust and W&B Weave, citing "Groundedness (98%)" — the
 *   fabricated number — as the evidence for that parity.
 *
 *   Its test asserted `codingTestsPassed === true`, i.e. a constant equalling
 *   itself, so the whole thing was green by construction.
 *
 *   A metric that cannot fail is not a metric. It is worse than nothing: it
 *   occupies the slot where a real check would go, and anyone reading the
 *   report reasonably concludes the system is verified.
 *
 * THE RULE THIS FILE NOW FOLLOWS
 *   Every metric is either MEASURED from a named real source, FAILED with a
 *   reason, or UNMEASURED with the reason it could not be measured. There is no
 *   fourth state and no default value.
 *
 *   `unmeasured` is NOT a pass. It is counted separately, printed loudly, and
 *   `fullyMeasured` records whether the report actually covered what it names,
 *   so this can never again be read as a green light for the whole system.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const THUMBGATE = path.join(os.homedir(), '.thumbgate');

const measured = (value, source, extra = {}) => ({ status: 'measured', value, source, ...extra });
const unmeasured = (reason) => ({ status: 'unmeasured', reason });
const failedM = (reason, source) => ({ status: 'failed', reason, source });

/**
 * Human thumbs — the metric the old file claimed was 100%. It is genuinely
 * available on disk, which is what makes the old value not a simplification
 * but a fabrication.
 */
function measureThumbs(opts = {}) {
  const p = opts.thumbsPath || path.join(THUMBGATE, 'feedback-summary.json');
  if (!fs.existsSync(p)) return unmeasured(`no feedback summary at ${p}`);
  let d;
  try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {
    return failedM(`feedback summary unreadable: ${e.message}`, p);
  }
  const total = Number(d.total);
  const positive = Number(d.positive);
  if (!Number.isFinite(total) || !Number.isFinite(positive) || total <= 0) {
    return unmeasured('feedback summary has no usable total/positive counts');
  }
  return measured(Number(((positive / total) * 100).toFixed(1)), p, {
    unit: '% thumbs-up',
    n: total,
    positive,
    negative: Number.isFinite(Number(d.negative)) ? Number(d.negative) : total - positive,
    lastUpdated: d.lastUpdated || null,
  });
}

/**
 * ThumbGate prevention rules. The old file printed PASS beside a count of 0 —
 * the clearest single illustration of the problem: the number was real and the
 * verdict ignored it.
 */
function measurePreventionRules(opts = {}) {
  const p = opts.rulesPath || path.join(THUMBGATE, 'memories.json');
  if (!fs.existsSync(p)) return unmeasured(`no prevention-rule store at ${p}`);
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const n = Array.isArray(d) ? d.length : Object.keys(d || {}).length;
    return measured(n, p, { unit: 'active prevention rules' });
  } catch (e) {
    return failedM(`prevention-rule store unreadable: ${e.message}`, p);
  }
}

/**
 * LLM-as-Judge — reported ONLY from a calibration artifact produced by
 * tools/llm-judge-calibrate.js, and only when that artifact certifies the judge
 * for the (model, promptVersion) pair it was measured on. Never a constant.
 */
function measureJudge(opts = {}) {
  const p = opts.calibrationPath
    || process.env.JUDGE_CALIBRATION_PATH
    || path.join(THUMBGATE, 'judge-calibration.json');
  if (!fs.existsSync(p)) {
    return unmeasured('no judge calibration artifact — run tools/llm-judge-calibrate.js --out <path>');
  }
  let d;
  try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {
    return failedM(`calibration artifact unreadable: ${e.message}`, p);
  }
  if (!d || typeof d.kappa !== 'number') return failedM('calibration artifact has no kappa', p);
  if (!d.certified) {
    return failedM(
      `judge NOT CERTIFIED (kappa ${d.kappa.toFixed(3)}, n ${d.n}): ${(d.notCertifiedBecause || []).join('; ')}`,
      p,
    );
  }
  return measured(Number(d.kappa.toFixed(3)), p, {
    unit: "Cohen's kappa vs human labels",
    n: d.n,
    accuracy: d.accuracy,
    majorityBaseline: d.majorityBaseline,
    model: d.model,
    promptVersion: d.promptVersion,
  });
}

/**
 * Run a real test file and report its real result. The old file ran exactly one
 * test and then reported "Accuracy 100% (50 prompts)" regardless — and that
 * 50-prompt dataset does not exist anywhere in the repo.
 */
function measureTestFile(root, rel, timeoutMs = 120000) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return unmeasured(`test file absent: ${rel}`);
  try {
    execFileSync(process.execPath, ['--test', abs], { stdio: 'pipe', timeout: timeoutMs });
    return measured('pass', rel);
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    const m = out.match(/^# fail (\d+)/m);
    return failedM(m ? `${m[1]} failing assertion(s)` : `exited ${e.status ?? 'non-zero'}`, rel);
  }
}

function runEvalBenchmarkSuite(options = {}) {
  const root = options.cwd || process.cwd();
  const startTime = Date.now();

  const metrics = {
    humanThumbsUpRate: measureThumbs(options),
    preventionRules: measurePreventionRules(options),
    llmJudgeKappa: measureJudge(options),
    connectorTests: options.skipTests
      ? unmeasured('test execution skipped by caller')
      : measureTestFile(root, path.join('tests', 'test-hermes-cloud-connector.js')),
    // These were `mobileE2EPassed: true` and `revenuePipelineHealthy: true`.
    // Neither is produced by this suite, so neither is claimed by it.
    mobileE2E: unmeasured('not produced by this suite — see .github/workflows/mobile-continuous.yml'),
    revenuePipeline: unmeasured('no automated revenue-health probe exists; external revenue is verified in Stripe, not here'),
  };

  const counts = { measured: 0, unmeasured: 0, failed: 0 };
  for (const m of Object.values(metrics)) counts[m.status] += 1;

  return {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    metrics,
    counts,
    ok: counts.failed === 0,
    fullyMeasured: counts.unmeasured === 0 && counts.failed === 0,
  };
}

function render(res) {
  const lines = ['', '=== HERMES EVAL BENCHMARK SUITE ===', `Timestamp: ${res.timestamp}`, ''];
  for (const [name, m] of Object.entries(res.metrics)) {
    if (m.status === 'measured') {
      const extra = [
        m.n != null ? `n=${m.n}` : null,
        m.majorityBaseline != null ? `baseline=${(m.majorityBaseline * 100).toFixed(1)}%` : null,
        m.model ? `${m.model}/${m.promptVersion}` : null,
      ].filter(Boolean).join(' ');
      lines.push(`  [MEASURED]   ${name}: ${m.value}${m.unit ? ` ${m.unit}` : ''}${extra ? `  (${extra})` : ''}`);
      lines.push(`               source: ${m.source}`);
    } else if (m.status === 'failed') {
      lines.push(`  [FAILED]     ${name}: ${m.reason}`);
    } else {
      lines.push(`  [UNMEASURED] ${name}: ${m.reason}`);
    }
  }
  lines.push('');
  lines.push(`  ${res.counts.measured} measured · ${res.counts.unmeasured} unmeasured · ${res.counts.failed} failed`);
  if (!res.fullyMeasured) lines.push('  NOTE: this is NOT full coverage. Unmeasured is not a pass.');
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  runEvalBenchmarkSuite,
  render,
  measureThumbs,
  measurePreventionRules,
  measureJudge,
  measureTestFile,
};

if (require.main === module) {
  const res = runEvalBenchmarkSuite({ skipTests: process.argv.includes('--no-tests') });
  if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else console.log(render(res));
  process.exit(res.ok ? 0 : 1);
}
