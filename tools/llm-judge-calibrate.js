#!/usr/bin/env node
'use strict';

/**
 * llm-judge-calibrate.js — measure whether the judge agrees with HUMANS.
 *
 * WHY ACCURACY ALONE IS A LIE HERE
 *   The human-labelled set in ~/.thumbgate/lessons-index.jsonl is 607 positive
 *   and 462 negative. A judge that answers "positive" every single time scores
 *   56.8% accuracy while knowing nothing. Reporting that as "57% accurate"
 *   would be exactly the fabricated-confidence problem this replaces.
 *
 *   So the headline number is COHEN'S KAPPA — agreement corrected for the
 *   agreement you would get by chance given the class balance:
 *
 *       kappa = (Po - Pe) / (1 - Pe)
 *
 *   kappa <= 0 means the judge carries no information beyond guessing the
 *   majority class, no matter how high its raw accuracy looks.
 *
 * CERTIFICATION IS EARNED, NOT ASSUMED
 *   The judge is only usable as a signal if kappa clears KAPPA_FLOOR on a
 *   sample of at least MIN_SAMPLE. Below either, this prints NOT CERTIFIED and
 *   exits non-zero. There is no default-pass path.
 *
 *   Calibration is bound to the exact (model, promptVersion) pair. Change
 *   either and the recorded result is void — which is the failure mode
 *   docs/RESEARCH-AI-REGRESSION-CONTROLS-JULY-2026.md:319 warns about:
 *   "a judge model or threshold changes without re-baselining".
 *
 * Usage:
 *   node tools/llm-judge-calibrate.js [--n 60] [--seed 7] [--out <path>]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { judge, JUDGE_MODEL, JUDGE_PROMPT_VERSION } = require('./llm-judge.js');

const KAPPA_FLOOR = 0.4;   // "moderate" agreement (Landis & Koch). Below this the judge is not a signal.
const MIN_SAMPLE = 30;     // too few and the interval is wider than the number itself.

const LABELS_PATH = process.env.JUDGE_LABELS_PATH
  || path.join(os.homedir(), '.thumbgate', 'lessons-index.jsonl');

// Deterministic PRNG so a calibration run is reproducible from its seed.
// Math.random() would make every run a different sample and make regressions
// indistinguishable from resampling noise.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadLabelled(limit, seed) {
  if (!fs.existsSync(LABELS_PATH)) {
    return { error: `no human-labelled corpus at ${LABELS_PATH} — cannot calibrate` };
  }
  const rows = [];
  for (const line of fs.readFileSync(LABELS_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const label = r.signal;
    if (label !== 'positive' && label !== 'negative') continue;
    const text = String(r.triggerMessage || r.lesson || '').trim();
    // Very short excerpts carry no signal for EITHER a human or a model; keeping
    // them would measure the corpus's noise floor, not the judge.
    if (text.length < 40) continue;
    rows.push({ id: r.id, label, text });
  }
  if (rows.length === 0) return { error: 'labelled corpus present but no usable rows' };

  const rnd = mulberry32(seed);
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return { rows: rows.slice(0, limit), total: rows.length };
}

function cohensKappa(matrix, n) {
  const { tp, tn, fp, fn } = matrix;
  const po = (tp + tn) / n;
  const predPos = (tp + fp) / n;
  const predNeg = (tn + fn) / n;
  const actPos = (tp + fn) / n;
  const actNeg = (tn + fp) / n;
  const pe = predPos * actPos + predNeg * actNeg;
  return pe === 1 ? 0 : (po - pe) / (1 - pe);
}

async function calibrate(opts = {}) {
  const n = opts.n || 60;
  const seed = opts.seed || 7;
  const loaded = loadLabelled(n, seed);
  if (loaded.error) return { ok: false, error: loaded.error };

  const results = [];
  for (const row of loaded.rows) {
    // Sequential on purpose: the gateway is a shared single instance and
    // hammering it in parallel produces rate-limit errors that would be
    // silently scored as judge failures.
    // eslint-disable-next-line no-await-in-loop
    const v = await judge(row.text, opts.judgeOpts);
    results.push({ ...row, judged: v });
    if (opts.onProgress) opts.onProgress(results.length, loaded.rows.length);
  }

  const scored = results.filter((r) => r.judged.ok);
  const failed = results.length - scored.length;

  const m = { tp: 0, tn: 0, fp: 0, fn: 0 };
  for (const r of scored) {
    const p = r.judged.verdict === 'negative';   // treat "negative" as the positive class:
    const a = r.label === 'negative';            // catching dissatisfaction is the useful job
    if (p && a) m.tp += 1;
    else if (!p && !a) m.tn += 1;
    else if (p && !a) m.fp += 1;
    else m.fn += 1;
  }

  const total = scored.length;
  const accuracy = total ? (m.tp + m.tn) / total : 0;
  const actualNeg = m.tp + m.fn;
  const actualPos = m.tn + m.fp;
  // The number the judge must beat to have earned anything at all.
  const majorityBaseline = total ? Math.max(actualNeg, actualPos) / total : 0;
  const kappa = total ? cohensKappa(m, total) : 0;
  const precision = (m.tp + m.fp) ? m.tp / (m.tp + m.fp) : 0;
  const recall = (m.tp + m.fn) ? m.tp / (m.tp + m.fn) : 0;
  const f1 = (precision + recall) ? (2 * precision * recall) / (precision + recall) : 0;
  // Wald 95% interval on accuracy — a bare point estimate at n=60 hides how
  // wide the uncertainty really is.
  const se = total ? Math.sqrt((accuracy * (1 - accuracy)) / total) : 0;
  const ci95 = [Math.max(0, accuracy - 1.96 * se), Math.min(1, accuracy + 1.96 * se)];

  const certified = total >= MIN_SAMPLE && kappa >= KAPPA_FLOOR;
  const reasons = [];
  if (total < MIN_SAMPLE) reasons.push(`sample ${total} < required ${MIN_SAMPLE}`);
  if (kappa < KAPPA_FLOOR) reasons.push(`kappa ${kappa.toFixed(3)} < floor ${KAPPA_FLOOR}`);

  return {
    ok: true,
    certified,
    notCertifiedBecause: reasons,
    model: JUDGE_MODEL,
    promptVersion: JUDGE_PROMPT_VERSION,
    corpus: { path: LABELS_PATH, usableRows: loaded.total, sampled: loaded.rows.length, seed },
    judgeFailures: failed,
    n: total,
    matrix: m,
    accuracy,
    accuracyCi95: ci95,
    majorityBaseline,
    liftOverBaseline: accuracy - majorityBaseline,
    kappa,
    precisionNegative: precision,
    recallNegative: recall,
    f1Negative: f1,
  };
}

/**
 * Certify across SEVERAL seeds, not one.
 *
 * WHY THIS EXISTS — a defect found in this very file on 2026-07-30.
 *   calibrate() certifies from a single sample, and a single sample is not a
 *   measurement. Five runs of n≈40 against the same corpus gave:
 *
 *       0.652  0.682  0.656  0.842  0.386
 *
 *   mean 0.644, sd 0.164. One of those five is BELOW the 0.40 floor. So
 *   "CERTIFIED" flipped depending on which seed happened to be drawn — a
 *   coin-flip dressed up as a gate, which is the same class of defect as every
 *   fabricated metric this work replaced.
 *
 * THE RULE
 *   Certify on the LOWER BOUND of the 95% confidence interval of the mean
 *   kappa, across at least MIN_SEEDS independent samples. That asks the honest
 *   question — "is the judge's TRUE kappa above the floor?" — instead of "did
 *   this one draw land above it?".
 *
 *   The per-seed spread is always reported, including how many individual runs
 *   fell below the floor, so a wide spread can never hide behind a passing mean.
 */
const MIN_SEEDS = 5;

async function certifyAcrossSeeds(opts = {}) {
  const seeds = opts.seeds || [7, 11, 23, 37, 51];
  const runs = [];
  for (const seed of seeds) {
    // eslint-disable-next-line no-await-in-loop
    const r = await calibrate({ ...opts, seed });
    if (!r.ok) return { ok: false, error: `seed ${seed}: ${r.error}` };
    runs.push({ seed, kappa: r.kappa, n: r.n, accuracy: r.accuracy, majorityBaseline: r.majorityBaseline });
    if (opts.onSeedDone) opts.onSeedDone(r, seed);
  }

  const ks = runs.map((r) => r.kappa);
  const mean = ks.reduce((a, b) => a + b, 0) / ks.length;
  const variance = ks.length > 1
    ? ks.reduce((a, b) => a + (b - mean) ** 2, 0) / (ks.length - 1)
    : 0;
  const sd = Math.sqrt(variance);
  const sem = ks.length ? sd / Math.sqrt(ks.length) : 0;
  const ciLow = mean - 1.96 * sem;
  const ciHigh = mean + 1.96 * sem;
  const belowFloor = ks.filter((k) => k < KAPPA_FLOOR).length;

  const reasons = [];
  if (runs.length < MIN_SEEDS) reasons.push(`only ${runs.length} seeds, need ${MIN_SEEDS}`);
  if (ciLow < KAPPA_FLOOR) reasons.push(`95% CI lower bound ${ciLow.toFixed(3)} < floor ${KAPPA_FLOOR}`);

  return {
    ok: true,
    certified: reasons.length === 0,
    notCertifiedBecause: reasons,
    model: JUDGE_MODEL,
    promptVersion: JUDGE_PROMPT_VERSION,
    runs,
    seeds,
    totalJudged: runs.reduce((a, r) => a + r.n, 0),
    kappaMean: mean,
    kappaSd: sd,
    kappaMin: Math.min(...ks),
    kappaMax: Math.max(...ks),
    kappaCi95: [ciLow, ciHigh],
    runsBelowFloor: belowFloor,
    // Certification is a statement about the MEAN. Individual runs varying is
    // expected; this number is surfaced so nobody reads one run as gospel.
    singleRunIsUnreliable: belowFloor > 0,
  };
}

module.exports = {
  calibrate, certifyAcrossSeeds, cohensKappa, loadLabelled, KAPPA_FLOOR, MIN_SAMPLE, MIN_SEEDS,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => {
    const i = argv.indexOf(k);
    return i === -1 ? d : argv[i + 1];
  };
  const n = Number(arg('--n', 60));
  const seed = Number(arg('--seed', 7));
  const out = arg('--out', '');

  // Multi-seed is the only mode whose CERTIFIED means anything; single-seed
  // remains available for a quick look but says so in its output.
  if (argv.includes('--seeds')) {
    const seeds = String(arg('--seeds', '7,11,23,37,51')).split(',').map(Number).filter(Number.isFinite);
    certifyAcrossSeeds({
      n,
      seeds,
      onSeedDone: (r, s) => process.stderr.write(`\r\x1b[K  seed ${s}: kappa ${r.kappa.toFixed(3)} (n=${r.n})\n`),
      onProgress: (d, t) => process.stderr.write(`\r  judging ${d}/${t}…`),
    }).then((r) => {
      process.stderr.write('\r\x1b[K');
      if (!r.ok) { console.error(`CALIBRATION FAILED: ${r.error}`); process.exit(2); }
      console.log('\n=== LLM JUDGE CALIBRATION (multi-seed) ===');
      console.log(`  model / prompt     ${r.model} / ${r.promptVersion}`);
      console.log(`  seeds              ${r.seeds.join(', ')}   (${r.totalJudged} items judged in total)`);
      console.log(`  per-seed kappa     ${r.runs.map((x) => x.kappa.toFixed(3)).join('  ')}`);
      console.log(`  kappa mean +- sd   ${r.kappaMean.toFixed(3)} +- ${r.kappaSd.toFixed(3)}   (min ${r.kappaMin.toFixed(3)}, max ${r.kappaMax.toFixed(3)})`);
      console.log(`  95% CI of mean     [${r.kappaCi95[0].toFixed(3)}, ${r.kappaCi95[1].toFixed(3)}]   floor ${KAPPA_FLOOR}`);
      console.log(`  runs below floor   ${r.runsBelowFloor}/${r.runs.length}${r.singleRunIsUnreliable ? '   <- a SINGLE run cannot be trusted to certify' : ''}`);
      console.log(`\n  VERDICT: ${r.certified ? 'CERTIFIED on the CI lower bound (signal only, never a sole gate)' : `NOT CERTIFIED — ${r.notCertifiedBecause.join('; ')}`}\n`);
      if (out) { fs.writeFileSync(out, JSON.stringify(r, null, 2)); console.log(`  written: ${out}\n`); }
      process.exit(r.certified ? 0 : 1);
    });
    return;
  }

  calibrate({
    n,
    seed,
    onProgress: (done, tot) => process.stderr.write(`\r  judging ${done}/${tot}…`),
  }).then((r) => {
    process.stderr.write('\r\x1b[K');
    if (!r.ok) {
      console.error(`CALIBRATION FAILED: ${r.error}`);
      process.exit(2);
    }
    const pc = (x) => `${(x * 100).toFixed(1)}%`;
    console.log('\n=== LLM JUDGE CALIBRATION ===');
    console.log(`  model / prompt     ${r.model} / ${r.promptVersion}`);
    console.log(`  corpus             ${r.corpus.usableRows} labelled rows, sampled ${r.corpus.sampled} (seed ${r.corpus.seed})`);
    console.log(`  judged ok          ${r.n}   (transport/parse failures: ${r.judgeFailures})`);
    console.log(`  confusion          tp=${r.matrix.tp} tn=${r.matrix.tn} fp=${r.matrix.fp} fn=${r.matrix.fn}   [class = "negative"]`);
    console.log(`  accuracy           ${pc(r.accuracy)}  95% CI [${pc(r.accuracyCi95[0])}, ${pc(r.accuracyCi95[1])}]`);
    console.log(`  majority baseline  ${pc(r.majorityBaseline)}   <- beat this or the judge knows nothing`);
    console.log(`  lift over baseline ${(r.liftOverBaseline * 100).toFixed(1)} pts`);
    console.log(`  COHEN'S KAPPA      ${r.kappa.toFixed(3)}   (floor ${KAPPA_FLOOR})`);
    console.log(`  precision/recall   ${pc(r.precisionNegative)} / ${pc(r.recallNegative)}   f1 ${pc(r.f1Negative)}`);
    console.log(`\n  VERDICT: ${r.certified ? 'CERTIFIED — usable as a signal (never as a sole gate)' : `NOT CERTIFIED — ${r.notCertifiedBecause.join('; ')}`}\n`);
    if (out) {
      fs.writeFileSync(out, JSON.stringify(r, null, 2));
      console.log(`  written: ${out}\n`);
    }
    process.exit(r.certified ? 0 : 1);
  });
}
