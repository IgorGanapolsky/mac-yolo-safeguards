'use strict';

// These tests exist because the suite they cover used to be almost entirely
// fabricated, and the ONLY test guarding it asserted a hardcoded literal
// (`domainMetrics.codingTestsPassed === true`) — a test that could never fail.
// Every case below is written so that reintroducing a constant breaks it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runEvalBenchmarkSuite } = require('../tools/eval-benchmark-suite');

const ROOT = path.join(__dirname, '..');

function fixtureHome(feedback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalsuite-'));
  if (feedback) {
    fs.mkdirSync(path.join(dir, '.thumbgate'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.thumbgate', 'feedback-summary.json'), JSON.stringify(feedback));
  }
  return dir;
}

test('every metric declares whether it was measured', () => {
  const res = runEvalBenchmarkSuite({ cwd: ROOT, home: fixtureHome(null) });
  assert.ok(res.timestamp);
  assert.equal(typeof res.durationMs, 'number');
  for (const [name, m] of Object.entries(res.metrics)) {
    assert.equal(typeof m.measured, 'boolean', `${name} has no 'measured' flag`);
    if (m.measured) assert.ok(m.source, `${name} claims measured but names no source`);
    else assert.ok(m.reason, `${name} is unmeasured but gives no reason`);
  }
});

test('thumbs-up rate is COMPUTED from the feedback store, not a constant', () => {
  // The old suite hardcoded thumbsUpRatePct: 100. Two different fixtures must
  // produce two different rates, which no literal can satisfy.
  const a = runEvalBenchmarkSuite({ cwd: ROOT, home: fixtureHome({ total: 10, positive: 4, negative: 6 }) });
  assert.equal(a.metrics.humanFeedback.measured, true);
  assert.equal(a.metrics.humanFeedback.thumbsUpRatePct, 40);

  const b = runEvalBenchmarkSuite({ cwd: ROOT, home: fixtureHome({ total: 4, positive: 3, negative: 1 }) });
  assert.equal(b.metrics.humanFeedback.thumbsUpRatePct, 75);

  assert.notEqual(a.metrics.humanFeedback.thumbsUpRatePct, b.metrics.humanFeedback.thumbsUpRatePct);
});

test('a missing store is reported as unmeasured, never as zero or passing', () => {
  // absence-is-not-evidence: the old code reported preventionRulesActive: 0 for
  // a file that does not exist, which reads as "no violations" rather than
  // "never checked".
  const res = runEvalBenchmarkSuite({ cwd: ROOT, home: fixtureHome(null) });
  assert.equal(res.metrics.preventionRules.measured, false);
  assert.equal(res.metrics.preventionRules.activeCount, undefined);
  assert.equal(res.metrics.humanFeedback.measured, false);
  assert.equal(res.metrics.humanFeedback.thumbsUpRatePct, undefined);
});

test('a malformed feedback store is unmeasured rather than silently scored', () => {
  const res = runEvalBenchmarkSuite({ cwd: ROOT, home: fixtureHome({ total: 0, positive: 0 }) });
  assert.equal(res.metrics.humanFeedback.measured, false);
  assert.match(res.metrics.humanFeedback.reason, /malformed/);
});

test('known-fabricated metrics stay declared as unmeasured', () => {
  // retrievalRecall left this list on 2026-07-29: it is now computed by
  // tools/rag-retrieval-eval.js (see the dedicated test below).
  const res = runEvalBenchmarkSuite({ cwd: ROOT, home: fixtureHome(null) });
  for (const key of ['offlineAccuracy', 'llmAsAJudge']) {
    assert.equal(res.metrics[key].measured, false, `${key} must not claim to be measured`);
  }
  // They must remain visible in the gap list, not quietly dropped.
  const gapKeys = res.unmeasured.map((g) => g.split(':')[0]);
  for (const key of ['offlineAccuracy', 'llmAsAJudge']) {
    assert.ok(gapKeys.includes(key), `${key} missing from the unmeasured list`);
  }
});

test('retrieval recall is MEASURED from the production eval and floored at 0.6', () => {
  const res = runEvalBenchmarkSuite({ cwd: ROOT, home: fixtureHome(null) });
  const rr = res.metrics.retrievalRecall;
  assert.equal(rr.measured, true, `retrievalRecall unmeasured: ${rr.reason}`);
  assert.match(rr.source, /rag-retrieval-eval/);
  // Real fractions computed this run, not constants.
  for (const key of ['lexicalMeanRecallAtK', 'lexicalMeanMRR', 'combinedMeanRecallAtK', 'combinedMeanMRR']) {
    assert.equal(typeof rr[key], 'number', `${key} is not a number`);
    assert.ok(rr[key] >= 0 && rr[key] <= 1, `${key}=${rr[key]} outside [0,1]`);
  }
  assert.ok(Number.isInteger(rr.combinedCaseCount) && rr.combinedCaseCount >= 5, 'combinedCaseCount implausibly small');
  assert.equal(rr.floor, 0.6);
  assert.equal(rr.belowFloor, rr.combinedMeanRecallAtK < rr.floor, 'belowFloor must be derived from the measured mean');

  // Floor breaches and an unmeasurable lessons backend (CI checkouts carry no
  // local ThumbGate store) surface in the gap list instead of vanishing.
  const rrGaps = res.unmeasured.filter((g) => g.startsWith('retrievalRecall:'));
  if (rr.belowFloor) {
    assert.ok(rrGaps.some((g) => g.includes('below the 0.6 floor')), 'below-floor recall must be listed as a gap');
  }
  if (rr.lessonsAvailable) {
    assert.equal(typeof rr.lessonsMeanRecallAtK, 'number');
    assert.equal(typeof rr.lessonsMeanMRR, 'number');
  } else {
    assert.ok(rrGaps.some((g) => g.includes('lessons backend unmeasured')), 'missing lessons backend must be listed as a gap');
  }
  if (!rr.belowFloor && rr.lessonsAvailable) {
    assert.equal(rrGaps.length, 0, `healthy retrieval must not appear in the gap list: ${rrGaps.join(' | ')}`);
  }
});

// A stub repo root whose tools/rag-retrieval-eval.js prints a fixed report,
// so the floor and lessons-unavailable branches can be exercised
// deterministically — the real repo (hopefully) stays above the floor.
function stubEvalRoot(report) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evalsuite-root-'));
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'tools', 'rag-retrieval-eval.js'),
    `console.log(${JSON.stringify(JSON.stringify(report))});`,
  );
  return root;
}

test('combined recall below the 0.6 floor is listed as a gap', () => {
  const root = stubEvalRoot({
    ok: false,
    backends: {
      lexical: { meanRecallAtK: 0.4, meanMRR: 0.3 },
      lessons: { available: true, meanRecallAtK: 0.2, meanMRR: 0.2 },
    },
    combined: { caseCount: 14, meanRecallAtK: 0.3, meanMRR: 0.25 },
  });
  const res = runEvalBenchmarkSuite({ cwd: root, home: fixtureHome(null) });
  const rr = res.metrics.retrievalRecall;
  assert.equal(rr.measured, true);
  assert.equal(rr.belowFloor, true);
  assert.ok(
    res.unmeasured.some((g) => g.startsWith('retrievalRecall:') && g.includes('0.3 is below the 0.6 floor')),
    `floor breach missing from gaps: ${JSON.stringify(res.unmeasured)}`,
  );
});

test('an unmeasurable lessons backend is listed as a gap, not silently averaged away', () => {
  const root = stubEvalRoot({
    ok: true,
    backends: {
      lexical: { meanRecallAtK: 1, meanMRR: 1 },
      lessons: { available: false, reason: 'no lessons store on this machine' },
    },
    combined: { caseCount: 5, meanRecallAtK: 1, meanMRR: 1 },
  });
  const res = runEvalBenchmarkSuite({ cwd: root, home: fixtureHome(null) });
  const rr = res.metrics.retrievalRecall;
  assert.equal(rr.measured, true);
  assert.equal(rr.lessonsAvailable, false);
  assert.equal(rr.lessonsMeanRecallAtK, undefined);
  assert.ok(
    res.unmeasured.some((g) => g.includes('lessons backend unmeasured — no lessons store on this machine')),
    `lessons gap missing: ${JSON.stringify(res.unmeasured)}`,
  );
});

test('no numeric score is reported outside a measured metric', () => {
  // The anti-fabrication guard: any score-shaped field must sit under
  // measured:true with a source. This is what would catch a future
  // `groundednessScore: 0.98` being pasted back in.
  const res = runEvalBenchmarkSuite({ cwd: ROOT, home: fixtureHome(null) });
  const scoreish = /(Pct|Score|Count|Rate|exported|total)$/i;
  for (const [name, m] of Object.entries(res.metrics)) {
    for (const [k, v] of Object.entries(m)) {
      if (k === 'measured' || k === 'source' || k === 'reason') continue;
      if (scoreish.test(k) && typeof v === 'number') {
        assert.equal(m.measured, true, `${name}.${k} reports a number without being measured`);
        assert.ok(m.source, `${name}.${k} reports a number with no source`);
      }
    }
  }
});

test('suite makes no framework-parity claims', () => {
  // It used to assert equivalence with LangSmith / OpenAI Evals / Arize Phoenix /
  // Braintrust / W&B Weave in prose, which demonstrated nothing.
  const res = runEvalBenchmarkSuite({ cwd: ROOT, home: fixtureHome(null) });
  assert.equal(res.frameworkEquivalence, undefined);
  const blob = JSON.stringify(res);
  for (const vendor of ['LangSmith', 'Braintrust', 'Arize', 'Weave']) {
    assert.ok(!blob.includes(vendor), `suite still claims parity with ${vendor}`);
  }
});
