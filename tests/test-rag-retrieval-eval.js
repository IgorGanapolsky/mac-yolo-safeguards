#!/usr/bin/env node
'use strict';

/**
 * CI gate for retrieval quality. Runs tools/rag-retrieval-eval.js --json and
 * asserts the aggregate metrics stay above a floor, so retrieval regressions
 * fail the build instead of shipping silently.
 *
 * Floors (2026-07-29, after doc-side dual tokenization + fixture repair):
 *   measured: 8/8 pass · meanRecallAtK=1.0 · meanMrrAtK=0.893 · meanNdcgAtK=0.890
 *   floors leave headroom for benign corpus drift, not for regressions.
 *
 * Named test-*.js so .github/workflows/ci.yml's `for f in tests/test-*.js`
 * loop picks it up automatically.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const EVAL = path.join(REPO, 'tools', 'rag-retrieval-eval.js');
const FIXTURE = path.join(REPO, 'tests', 'fixtures', 'rag-eval', 'cases.json');

const FLOOR_MEAN_RECALL = 0.9;
const FLOOR_MEAN_NDCG = 0.75;
const FLOOR_MEAN_MRR = 0.75;
const MIN_CASES = 8;
const MAX_FAILING_CASES = 0;

function fail(message) {
  console.error(`RAG retrieval eval gate: FAIL — ${message}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(EVAL) || !fs.existsSync(FIXTURE)) {
    // A missing eval harness is itself a regression worth failing on: this
    // gate exists precisely because the eval used to live outside CI.
    fail(`missing ${!fs.existsSync(EVAL) ? EVAL : FIXTURE}`);
  }

  const run = spawnSync(process.execPath, [EVAL, '--json'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  // The eval exits 1 when any case fails; the JSON report is still on stdout.
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch (error) {
    fail(`eval produced no parseable JSON (exit ${run.status}): ${(run.stderr || run.stdout || '').slice(0, 400)}`);
  }

  const failures = [];
  if ((report.caseCount || 0) < MIN_CASES) {
    failures.push(`caseCount ${report.caseCount} < ${MIN_CASES} (fixture shrank)`);
  }
  const failingCases = (report.caseCount || 0) - (report.passCount || 0);
  if (failingCases > MAX_FAILING_CASES) {
    const ids = (report.results || []).filter((r) => !r.pass).map((r) => r.id).join(', ');
    failures.push(`${failingCases} failing case(s): ${ids}`);
  }
  if ((report.meanRecallAtK || 0) < FLOOR_MEAN_RECALL) {
    failures.push(`meanRecallAtK ${report.meanRecallAtK} < floor ${FLOOR_MEAN_RECALL}`);
  }
  if ((report.meanNdcgAtK || 0) < FLOOR_MEAN_NDCG) {
    failures.push(`meanNdcgAtK ${report.meanNdcgAtK} < floor ${FLOOR_MEAN_NDCG}`);
  }
  if (report.meanMrrAtK !== undefined && report.meanMrrAtK < FLOOR_MEAN_MRR) {
    failures.push(`meanMrrAtK ${report.meanMrrAtK} < floor ${FLOOR_MEAN_MRR}`);
  }

  if (failures.length > 0) fail(failures.join(' · '));

  console.log(
    `RAG retrieval eval gate: PASS — ${report.passCount}/${report.caseCount} cases · recall@k=${report.meanRecallAtK} · MRR@k=${report.meanMrrAtK ?? 'n/a'} · nDCG@k=${report.meanNdcgAtK}`,
  );
}

main();
