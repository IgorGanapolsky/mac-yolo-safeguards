'use strict';

// Tests for the eval benchmark suite.
//
// The test this replaces asserted:
//
//     assert.equal(results.metrics.domainMetrics.codingTestsPassed, true);
//
// against a source line that read `codingTestsPassed: true`. A constant
// asserted to equal itself. It could not fail — which is exactly how the suite
// stayed green while reporting a fabricated 98% groundedness and a fabricated
// 100% thumbs-up rate, when the real rate on disk was 41.3%.
//
// So the property under test here is not "the numbers are good". It is:
//
//     every reported metric traces to a real source, and anything that cannot
//     be measured says so instead of defaulting to a pass.
//
// Every source is injected via a temp dir, so these run hermetically and
// deterministically regardless of what happens to be in ~/.thumbgate.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  runEvalBenchmarkSuite, render, measureThumbs, measurePreventionRules, measureJudge,
} = require('../tools/eval-benchmark-suite');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-suite-'));
const write = (name, obj) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return p;
};
const missing = path.join(dir, 'does-not-exist.json');
const ROOT = path.join(__dirname, '..');

// --- the anti-fabrication property -------------------------------------------

test('no metric is a hardcoded constant: the value tracks its source file', () => {
  const a = measureThumbs({ thumbsPath: write('t1.json', { total: 1000, positive: 250 }) });
  const b = measureThumbs({ thumbsPath: write('t2.json', { total: 1000, positive: 750 }) });
  assert.equal(a.value, 25);
  assert.equal(b.value, 75);
  assert.notEqual(a.value, b.value, 'the number must come from the data, not from the source code');
});

test('the real 41.3% shape is reported, not 100%', () => {
  // The exact counts in the live store that the old file ignored.
  const m = measureThumbs({ thumbsPath: write('t3.json', { total: 1640, positive: 678, negative: 962 }) });
  assert.equal(m.status, 'measured');
  assert.equal(m.value, 41.3);
  assert.equal(m.n, 1640, 'sample size must travel with the rate');
});

test('a missing source is UNMEASURED, never a pass', () => {
  const m = measureThumbs({ thumbsPath: missing });
  assert.equal(m.status, 'unmeasured');
  assert.ok(m.reason, 'must say WHY it could not be measured');
  assert.equal(m.value, undefined, 'unmeasured must not carry a value');
});

test('an unreadable source is FAILED, not silently skipped', () => {
  const m = measureThumbs({ thumbsPath: write('broken.json', '{not json') });
  assert.equal(m.status, 'failed');
  assert.match(m.reason, /unreadable/);
});

test('a zero count is reported as zero, not upgraded to a pass', () => {
  // The old suite literally printed "[PASS] 0 active prevention rules".
  const m = measurePreventionRules({ rulesPath: write('rules.json', []) });
  assert.equal(m.status, 'measured');
  assert.equal(m.value, 0);
});

// --- the judge must be certified, not assumed --------------------------------

test('an uncertified judge calibration FAILS the suite', () => {
  const m = measureJudge({
    calibrationPath: write('cal-bad.json', {
      kappa: 0.11, n: 40, certified: false, notCertifiedBecause: ['kappa 0.110 < floor 0.4'],
    }),
  });
  assert.equal(m.status, 'failed');
  assert.match(m.reason, /NOT CERTIFIED/);
});

test('a certified calibration is reported WITH n, baseline and model provenance', () => {
  const m = measureJudge({
    calibrationPath: write('cal-good.json', {
      kappa: 0.682, n: 38, accuracy: 0.842, majorityBaseline: 0.526,
      certified: true, model: 'glm-turbo', promptVersion: 'v1-2026-07-30',
    }),
  });
  assert.equal(m.status, 'measured');
  assert.equal(m.value, 0.682);
  assert.equal(m.n, 38);
  // Without the baseline, a kappa is uninterpretable — it must travel with it.
  assert.equal(m.majorityBaseline, 0.526);
  assert.equal(m.model, 'glm-turbo');
  assert.equal(m.promptVersion, 'v1-2026-07-30', 'a score without its prompt version cannot be re-baselined');
});

test('an absent calibration is UNMEASURED — never a default 0.98', () => {
  const m = measureJudge({ calibrationPath: missing });
  assert.equal(m.status, 'unmeasured');
  assert.equal(m.value, undefined);
  assert.match(m.reason, /llm-judge-calibrate/, 'must tell the reader how to produce it');
});

// --- suite-level accounting ---------------------------------------------------

test('a failed metric makes the whole run not-ok', () => {
  const res = runEvalBenchmarkSuite({
    cwd: ROOT,
    skipTests: true,
    thumbsPath: write('broken2.json', '{nope'),
    rulesPath: missing,
    calibrationPath: missing,
  });
  assert.equal(res.ok, false, 'a FAILED metric must make ok=false');
  assert.ok(res.counts.failed >= 1);
});

test('unmeasured metrics do not fail the run, but are never counted as measured', () => {
  const res = runEvalBenchmarkSuite({
    cwd: ROOT, skipTests: true, thumbsPath: missing, rulesPath: missing, calibrationPath: missing,
  });
  assert.equal(res.counts.failed, 0);
  assert.ok(res.counts.unmeasured >= 3);
  assert.equal(res.fullyMeasured, false, 'a report full of unmeasured metrics is not full coverage');
});

test('the rendered report labels unmeasured metrics visibly and never says PASS', () => {
  const res = runEvalBenchmarkSuite({
    cwd: ROOT, skipTests: true, thumbsPath: missing, rulesPath: missing, calibrationPath: missing,
  });
  const out = render(res);
  assert.match(out, /\[UNMEASURED\]/);
  assert.match(out, /Unmeasured is not a pass/);
  assert.doesNotMatch(out, /\[PASS\]/, 'PASS must never appear beside an unmeasured metric');
});

test('the suite still reports a timestamp and duration', () => {
  const res = runEvalBenchmarkSuite({ cwd: ROOT, skipTests: true });
  assert.ok(res.timestamp);
  assert.equal(typeof res.durationMs, 'number');
});

process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
