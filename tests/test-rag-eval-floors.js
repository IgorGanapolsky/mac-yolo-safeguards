#!/usr/bin/env node
'use strict';

// Regression floors for the RAG retrieval eval.
//
// The fixture grew from 8 to 50 cases on 2026-07-31. Eight cases could not
// detect a real regression: one case is 12.5% of the score, so noise and signal
// are the same size, and the reported 87.5% recall was a number nobody could
// act on.
//
// FLOORS ARE SET BELOW THE MEASURED BASELINE ON PURPOSE.
// Measured at 50 cases: 43/50 pass, mean recall@k 0.86, mean nDCG@k 0.60.
// A floor set AT the baseline fails the moment anything drifts and gets muted;
// a floor set below it catches a real regression and stays credible. Raise these
// as retrieval genuinely improves — that is the intended ratchet.

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MIN_RECALL = 0.75;   // baseline 0.86
const MIN_NDCG = 0.45;     // baseline 0.60
const MIN_PASSING = 38;    // baseline 43 of 50

let out;
try {
  out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'rag-retrieval-eval.js'), '--json'], {
    encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024, cwd: ROOT,
  });
} catch (e) {
  // The eval exits non-zero when cases fail, which is expected — we grade the
  // REPORT, not its exit code. Only an unparseable report is fatal.
  out = `${e.stdout || ''}`;
}

let report;
try {
  report = JSON.parse(out);
} catch {
  console.error('FAIL rag-eval produced no parseable JSON report — cannot determine quality, which is a failure');
  process.exit(1);
}

const cases = report.results || report.cases || [];
const passing = cases.filter((c) => c.pass !== false && (c.recallAtK ?? 0) > 0).length;
const recall = report.meanRecallAtK ?? 0;
const ndcg = report.meanNdcgAtK ?? 0;

let failed = 0;
const check = (name, actual, floor) => {
  if (actual >= floor) { console.log(`PASS ${name}: ${actual} >= ${floor}`); return; }
  console.error(`FAIL ${name}: ${actual} < floor ${floor}`);
  failed += 1;
};

// A shrunken fixture would trivially raise every average, so guard the size too.
check('fixture size', cases.length, 45);
check('mean recall@k', Number(recall.toFixed(4)), MIN_RECALL);
check('mean nDCG@k', Number(ndcg.toFixed(4)), MIN_NDCG);
check('passing cases', passing, MIN_PASSING);

console.log(`\n=== rag-eval floors: ${failed === 0 ? 'OK' : `${failed} floor(s) breached`} ===`);
process.exit(failed === 0 ? 0 : 1);
