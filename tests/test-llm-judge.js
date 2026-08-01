#!/usr/bin/env node
'use strict';

// Tests for the LLM judge and its calibration harness.
//
// Everything here is HERMETIC: the judge's transport is injected, so no test
// touches the network. A judge test that needs a live gateway would be skipped
// in CI, and a skipped test is indistinguishable from a passing one — which is
// the failure this whole file exists to prevent.
//
// The property under test is not "the judge is smart". It is:
//   a judge that cannot answer must SAY SO, and must never emit a verdict it
//   did not get from the model.
// The thing being replaced (eval-benchmark-suite.js) hardcoded
// `groundednessScore: 0.98` and could not fail. These tests exist so this one
// can.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { judge, extractJson, JUDGE_PROMPT_VERSION } = require(path.join(ROOT, 'tools', 'llm-judge.js'));
const { cohensKappa, loadLabelled } = require(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'));

let pass = 0;
let fail = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const reply = (content) => async () => ({ ok: true, content });

// ---------------------------------------------------------------------------
// extractJson — reasoning models bury the answer after chain-of-thought.
// ---------------------------------------------------------------------------
test('extracts the JSON object that trails chain-of-thought', () => {
  const out = extractJson('The user seems upset. Let me think...\n{"verdict":"negative","confidence":0.9}');
  assert.equal(out.verdict, 'negative');
});

test('takes the LAST object when the preamble contains a decoy', () => {
  const out = extractJson('Maybe {"verdict":"positive"} — no. Final: {"verdict":"negative","confidence":0.8}');
  assert.equal(out.verdict, 'negative', 'must use the final answer, not a mid-reasoning draft');
});

test('handles nested braces inside the object', () => {
  const out = extractJson('x {"verdict":"negative","meta":{"a":{"b":1}},"confidence":0.7}');
  assert.equal(out.verdict, 'negative');
  assert.equal(out.meta.a.b, 1);
});

test('returns null rather than guessing when there is no JSON', () => {
  assert.equal(extractJson('I think the user is unhappy.'), null);
  assert.equal(extractJson(''), null);
  assert.equal(extractJson(null), null);
});

test('returns null on malformed JSON instead of a partial object', () => {
  assert.equal(extractJson('{"verdict":"negative", oops}'), null);
});

// ---------------------------------------------------------------------------
// judge() — every failure mode must be NAMED, never silently defaulted.
// ---------------------------------------------------------------------------
test('a good response yields a verdict with model+prompt provenance', async () => {
  const r = await judge('the build broke', {
    transport: reply('{"verdict":"negative","confidence":0.91,"reason":"build broke"}'),
  });
  assert.equal(r.ok, true);
  assert.equal(r.verdict, 'negative');
  assert.equal(r.confidence, 0.91);
  // Provenance is what makes a stale calibration detectable.
  assert.equal(r.promptVersion, JUDGE_PROMPT_VERSION);
  assert.ok(r.model, 'must record which model produced the verdict');
});

test('transport failure returns ok:false, never a verdict', async () => {
  const r = await judge('anything', { transport: async () => ({ ok: false, error: 'ECONNREFUSED' }) });
  assert.equal(r.ok, false);
  assert.equal(r.verdict, undefined, 'a dead gateway must not produce a verdict');
  assert.match(r.error, /ECONNREFUSED/);
});

test('unparseable model output returns ok:false, never a verdict', async () => {
  const r = await judge('anything', { transport: reply('I cannot answer that.') });
  assert.equal(r.ok, false);
  assert.equal(r.verdict, undefined);
  assert.match(r.error, /no JSON/i);
});

test('an out-of-vocabulary verdict is rejected, not coerced', async () => {
  const r = await judge('x', { transport: reply('{"verdict":"maybe","confidence":0.5}') });
  assert.equal(r.ok, false);
  assert.match(r.error, /invalid verdict/);
});

test('a nonsense confidence becomes null rather than a plausible number', async () => {
  const r = await judge('x', { transport: reply('{"verdict":"negative","confidence":42}') });
  assert.equal(r.ok, true);
  assert.equal(r.confidence, null, '42 must not be silently kept or clamped to 1.0');
});

test('an empty excerpt is refused before any model call', async () => {
  let called = false;
  const r = await judge('', { transport: async () => { called = true; return reply('{}')(); } });
  assert.equal(r.ok, false);
  assert.equal(called, false, 'must not spend a model call on empty input');
});

// ---------------------------------------------------------------------------
// cohensKappa — the metric that stops a majority-class guesser from scoring well.
// ---------------------------------------------------------------------------
test('kappa is ~0 for a judge that always guesses the majority class', () => {
  // 60 actual-negative, 40 actual-positive; judge says "negative" every time.
  const m = { tp: 60, fn: 0, fp: 40, tn: 0 };
  const k = cohensKappa(m, 100);
  const accuracy = (m.tp + m.tn) / 100;
  assert.equal(accuracy, 0.6, 'raw accuracy looks respectable...');
  assert.ok(Math.abs(k) < 1e-9, `...but kappa must expose it as worthless, got ${k}`);
});

test('kappa is 1 for perfect agreement and ~0 for chance', () => {
  assert.equal(cohensKappa({ tp: 50, tn: 50, fp: 0, fn: 0 }, 100), 1);
  const k = cohensKappa({ tp: 25, tn: 25, fp: 25, fn: 25 }, 100);
  assert.ok(Math.abs(k) < 1e-9, `coin-flip agreement must be ~0, got ${k}`);
});

test('kappa is negative when the judge is worse than chance', () => {
  assert.ok(cohensKappa({ tp: 10, tn: 10, fp: 40, fn: 40 }, 100) < 0);
});

// ---------------------------------------------------------------------------
// loadLabelled — absence of a corpus must be an error, never an empty pass.
// ---------------------------------------------------------------------------
test('a missing corpus is an ERROR, not an empty successful run', () => {
  const prev = process.env.JUDGE_LABELS_PATH;
  process.env.JUDGE_LABELS_PATH = path.join(os.tmpdir(), 'definitely-not-here-xyz.jsonl');
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  // eslint-disable-next-line global-require
  const fresh = require(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'));
  const r = fresh.loadLabelled(10, 1);
  assert.ok(r.error, 'a missing corpus must report an error');
  assert.match(r.error, /cannot calibrate/);
  if (prev === undefined) delete process.env.JUDGE_LABELS_PATH;
  else process.env.JUDGE_LABELS_PATH = prev;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
});

test('sampling is deterministic for a given seed, and varies by seed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-lab-'));
  const p = path.join(dir, 'labels.jsonl');
  fs.writeFileSync(p, Array.from({ length: 80 }, (_, i) => JSON.stringify({
    id: `r${i}`,
    signal: i % 2 ? 'positive' : 'negative',
    lesson: `a sufficiently long excerpt number ${i} to clear the minimum length filter`,
  })).join('\n'));

  const prev = process.env.JUDGE_LABELS_PATH;
  process.env.JUDGE_LABELS_PATH = p;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  // eslint-disable-next-line global-require
  const fresh = require(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'));

  const a = fresh.loadLabelled(10, 7).rows.map((r) => r.id);
  const b = fresh.loadLabelled(10, 7).rows.map((r) => r.id);
  const c = fresh.loadLabelled(10, 8).rows.map((r) => r.id);
  assert.deepEqual(a, b, 'same seed must give the same sample or regressions are unreadable');
  assert.notDeepEqual(a, c, 'a different seed must give a different sample');

  if (prev === undefined) delete process.env.JUDGE_LABELS_PATH;
  else process.env.JUDGE_LABELS_PATH = prev;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  fs.rmSync(dir, { recursive: true, force: true });
});


// ---------------------------------------------------------------------------
// certifyAcrossSeeds — the defect found in this very file on 2026-07-30.
//
// calibrate() certified from ONE sample. Five real runs of n~40 against the
// same corpus gave 0.652 0.682 0.656 0.842 0.386 — one of them BELOW the 0.40
// floor. "CERTIFIED" therefore flipped depending on which seed was drawn: a
// coin flip dressed up as a gate. Certification is now a statement about the
// MEAN's confidence interval, and these tests hold that line.
// ---------------------------------------------------------------------------
const { certifyAcrossSeeds: certify } = require(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'));

// Build a hermetic corpus + a transport whose verdict is a pure function of the
// excerpt, so agreement is fully controlled by the fixture.
function hermeticEnv(accuracyPattern) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-seeds-'));
  const p = path.join(dir, 'labels.jsonl');
  const rows = [];
  for (let i = 0; i < 200; i += 1) {
    const label = i % 2 ? 'positive' : 'negative';
    rows.push(JSON.stringify({ id: `r${i}`, signal: label,
      lesson: `${label} case number ${i} with enough characters to clear the length filter` }));
  }
  fs.writeFileSync(p, rows.join('\n'));
  const transport = async ({ messages }) => {
    const text = messages[messages.length - 1].content;
    const truth = text.includes('negative') ? 'negative' : 'positive';
    const said = accuracyPattern(text, truth);
    return { ok: true, content: JSON.stringify({ verdict: said, confidence: 0.9, reason: 'stub' }) };
  };
  return { dir, p, transport };
}

test('a PERFECT judge certifies across seeds', async () => {
  const env = hermeticEnv((_t, truth) => truth);
  const prev = process.env.JUDGE_LABELS_PATH;
  process.env.JUDGE_LABELS_PATH = env.p;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  const fresh = require(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'));
  const r = await fresh.certifyAcrossSeeds({ n: 20, seeds: [1, 2, 3, 4, 5], judgeOpts: { transport: env.transport } });
  assert.equal(r.ok, true);
  assert.equal(r.certified, true, `perfect agreement must certify, got ${JSON.stringify(r.notCertifiedBecause)}`);
  assert.equal(r.runsBelowFloor, 0);
  if (prev === undefined) delete process.env.JUDGE_LABELS_PATH; else process.env.JUDGE_LABELS_PATH = prev;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  fs.rmSync(env.dir, { recursive: true, force: true });
});

test('a COIN-FLIP judge is refused across seeds', async () => {
  let flip = 0;
  const env = hermeticEnv(() => (flip++ % 2 ? 'positive' : 'negative'));
  const prev = process.env.JUDGE_LABELS_PATH;
  process.env.JUDGE_LABELS_PATH = env.p;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  const fresh = require(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'));
  const r = await fresh.certifyAcrossSeeds({ n: 20, seeds: [1, 2, 3, 4, 5], judgeOpts: { transport: env.transport } });
  assert.equal(r.certified, false, 'a judge with no signal must NOT certify');
  assert.ok(r.notCertifiedBecause.some((x) => /CI lower bound/.test(x)));
  if (prev === undefined) delete process.env.JUDGE_LABELS_PATH; else process.env.JUDGE_LABELS_PATH = prev;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  fs.rmSync(env.dir, { recursive: true, force: true });
});

test('too few seeds is refused even when every run looks good', async () => {
  const env = hermeticEnv((_t, truth) => truth);
  const prev = process.env.JUDGE_LABELS_PATH;
  process.env.JUDGE_LABELS_PATH = env.p;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  const fresh = require(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'));
  const r = await fresh.certifyAcrossSeeds({ n: 20, seeds: [1, 2], judgeOpts: { transport: env.transport } });
  assert.equal(r.certified, false, 'two perfect seeds is still not a measurement');
  assert.ok(r.notCertifiedBecause.some((x) => /seeds/.test(x)));
  if (prev === undefined) delete process.env.JUDGE_LABELS_PATH; else process.env.JUDGE_LABELS_PATH = prev;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  fs.rmSync(env.dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// LABEL LEAKAGE — the defect that invalidated the first CERTIFIED result.
//
// build_dataset.py writes `lesson` only AFTER the outcome is known, so rows
// literally begin "MISTAKE: ..." or "SUCCESS: ...". Measured on the live
// corpus: 1280 of 1298 usable rows come from `lesson`, 84.7% contain an
// outcome word, and the label is recoverable from that ONE word 97.0% of the
// time. A six-line regex scored kappa 0.772 on it; the LLM judge scored 0.644.
//
// The judge was WORSE than the cheat, and the old gate (kappa >= 0.40)
// certified it anyway. Kappa-over-chance was the wrong bar.
// ---------------------------------------------------------------------------
const { stripOutcomeMarkers, trivialBaseline } = require(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'));

test('outcome markers are stripped so a judge cannot echo the label', () => {
  for (const [raw, banned] of [
    ['MISTAKE: the deploy failed', 'MISTAKE'],
    ['SUCCESS: it worked first try', 'SUCCESS'],
    ['user gave thumbs down on this', 'thumbs down'],
    ['the run FAILED overnight', 'FAILED'],
  ]) {
    const out = stripOutcomeMarkers(raw);
    assert.ok(!new RegExp(banned.replace(' ', '[ _-]?'), 'i').test(out),
      `"${banned}" survived stripping: ${out}`);
  }
});

test('stripping preserves the substantive text', () => {
  const out = stripOutcomeMarkers('MISTAKE: the deploy targeted the wrong cluster');
  assert.match(out, /deploy targeted the wrong cluster/,
    'stripping must remove the marker, not gut the transcript');
});

test('the trivial baseline reads the leak — that is the point', () => {
  assert.equal(trivialBaseline('MISTAKE: broken'), 'negative');
  assert.equal(trivialBaseline('SUCCESS: fine'), 'positive');
  // No marker -> majority class, which is what a cheat with no signal scores.
  assert.equal(trivialBaseline('an ordinary sentence'), 'positive');
});

test('a leak-echoing judge is REFUSED, and told it lost to a regex', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leak-'));
  const p = path.join(dir, 'l.jsonl');
  fs.writeFileSync(p, Array.from({ length: 200 }, (_, i) => {
    const neg = i % 2 === 0;
    return JSON.stringify({
      id: `r${i}`,
      signal: neg ? 'negative' : 'positive',
      lesson: `${neg ? 'MISTAKE: ' : 'SUCCESS: '}a sufficiently long body of text ${i} to clear the filter`,
    });
  }).join('\n'));
  const prev = process.env.JUDGE_LABELS_PATH;
  process.env.JUDGE_LABELS_PATH = p;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  // eslint-disable-next-line global-require
  const fresh = require(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'));
  const echo = async ({ messages }) => ({
    ok: true,
    content: JSON.stringify({
      verdict: /MISTAKE|FAIL/i.test(messages[messages.length - 1].content) ? 'negative' : 'positive',
      confidence: 0.9, reason: 'echo',
    }),
  });
  const r = await fresh.calibrate({ n: 60, seed: 7, judgeOpts: { transport: echo } });
  assert.equal(r.certified, false, 'a judge that only echoes leaked markers must NOT certify');
  assert.ok(r.baselineKappa > r.kappa, 'the regex must be shown beating it');
  assert.ok(r.notCertifiedBecause.some((x) => /trivial regex baseline/.test(x)),
    `must name the baseline as the reason, got: ${r.notCertifiedBecause.join(' | ')}`);
  if (prev === undefined) delete process.env.JUDGE_LABELS_PATH; else process.env.JUDGE_LABELS_PATH = prev;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  fs.rmSync(dir, { recursive: true, force: true });
});

// Each gate below is the ONLY thing preventing certification, so removing that
// gate flips `certified` to true and the test fails. The first draft of these
// asserted on the REASON TEXT while the judge also failed the kappa floor —
// so dropping a gate changed nothing observable and 3 of 5 mutations survived.
// A test must turn on the decision, not on the message.

// Corpus with NO leak: label is not recoverable from the text.
function cleanCorpus(n = 240) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-'));
  const p = path.join(dir, 'c.jsonl');
  fs.writeFileSync(p, Array.from({ length: n }, (_, i) => JSON.stringify({
    id: `r${i}`,
    signal: i % 2 === 0 ? 'negative' : 'positive',
    triggerMessage: `transcript number ${i} describing some agent behaviour at length`,
  })).join('\n'));
  return { dir, p };
}
async function calibrateWith(corpusPath, opts) {
  const prev = process.env.JUDGE_LABELS_PATH;
  process.env.JUDGE_LABELS_PATH = corpusPath;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  // eslint-disable-next-line global-require
  const fresh = require(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'));
  const r = await fresh.calibrate(opts);
  if (prev === undefined) delete process.env.JUDGE_LABELS_PATH; else process.env.JUDGE_LABELS_PATH = prev;
  delete require.cache[require.resolve(path.join(ROOT, 'tools', 'llm-judge-calibrate.js'))];
  return r;
}
// Answers correctly `acc` of the time; label comes from the fixture id parity,
// which the judge could not read from the text — so kappa is genuine.
const oracle = (acc) => {
  let i = 0;
  return async ({ messages }) => {
    const m = /number (\d+)/.exec(messages[messages.length - 1].content);
    const truth = m && Number(m[1]) % 2 === 0 ? 'negative' : 'positive';
    const right = (i += 1) % 100 < acc * 100;
    const v = right ? truth : (truth === 'negative' ? 'positive' : 'negative');
    return { ok: true, content: JSON.stringify({ verdict: v, confidence: 0.9, reason: 'x' }) };
  };
};

test('GATE: a judge that loses to the baseline is refused ON THAT GROUND ALONE', async () => {
  // Leaky corpus so the baseline scores high; judge is strong but not stronger.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  const p = path.join(dir, 'g.jsonl');
  fs.writeFileSync(p, Array.from({ length: 240 }, (_, i) => {
    const neg = i % 2 === 0;
    return JSON.stringify({
      id: `r${i}`, signal: neg ? 'negative' : 'positive',
      lesson: `${neg ? 'MISTAKE: ' : 'SUCCESS: '}number ${i} a long enough body to pass the filter`,
    });
  }).join('\n'));
  const r = await calibrateWith(p, { n: 80, seed: 3, judgeOpts: { transport: oracle(0.85) } });
  assert.ok(r.kappa >= 0.4, `judge must clear the kappa floor for this to isolate the gate, got ${r.kappa}`);
  assert.ok(r.baselineKappa >= r.kappa, `baseline must win here, got base=${r.baselineKappa} judge=${r.kappa}`);
  assert.equal(r.certified, false, 'losing to a six-line regex must block certification');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('GATE: low attempted-coverage is refused ON THAT GROUND ALONE', async () => {
  const { dir, p } = cleanCorpus();
  // Perfect judge, but half the attempts die in transport.
  let n = 0;
  const flaky = async (args) => {
    n += 1;
    if (n % 2 === 0) return { ok: false, error: 'transport blew up' };
    return oracle(1)(args);
  };
  const r = await calibrateWith(p, { n: 80, seed: 5, judgeOpts: { transport: flaky } });
  assert.ok(r.kappa >= 0.4, `judge kappa must be high to isolate coverage, got ${r.kappa}`);
  assert.ok(r.coverage < 0.8, `coverage must be low, got ${r.coverage}`);
  assert.equal(r.certified, false, 'a biased surviving subset must not certify');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('GATE: null-confidence verdicts are excluded from the scored set', async () => {
  const { dir, p } = cleanCorpus();
  const noConf = async ({ messages }) => {
    const m = /number (\d+)/.exec(messages[messages.length - 1].content);
    const truth = m && Number(m[1]) % 2 === 0 ? 'negative' : 'positive';
    // confidence 42 is out of range -> judge() nulls it -> must not be scored.
    return { ok: true, content: JSON.stringify({ verdict: truth, confidence: 42 }) };
  };
  const r = await calibrateWith(p, { n: 60, seed: 9, judgeOpts: { transport: noConf } });
  assert.equal(r.n, 0, `no verdict had valid confidence, so none may be scored; got n=${r.n}`);
  assert.ok(r.droppedNoConfidence > 0, 'the drop must be reported, not silent');
  assert.equal(r.certified, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a genuinely good judge on CLEAN data still certifies', async () => {
  // Guards the opposite failure: gates so strict nothing can ever pass.
  const { dir, p } = cleanCorpus();
  const r = await calibrateWith(p, { n: 80, seed: 11, judgeOpts: { transport: oracle(0.95) } });
  assert.ok(r.kappa > 0.7, `expected a strong kappa, got ${r.kappa}`);
  assert.ok(r.baselineKappa < 0.2, `clean corpus must starve the baseline, got ${r.baselineKappa}`);
  assert.equal(r.certified, true, `a real judge on unleaked data must certify: ${r.notCertifiedBecause}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fn();
      console.log(`PASS ${name}`);
      pass += 1;
    } catch (e) {
      console.error(`FAIL ${name}\n  ${e.message}`);
      fail += 1;
      process.exitCode = 1;
    }
  }
  console.log(`\n=== llm-judge: ${pass} passed, ${fail} failed ===`);
})();
