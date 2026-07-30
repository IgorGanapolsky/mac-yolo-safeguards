'use strict';

/**
 * End-to-end retrieval evaluation for hermes-retrieval-hybrid.js.
 *
 * Runs the semantic eval cases from tests/fixtures/rag-eval/semantic-cases.json
 * against both keyword-only and hybrid (keyword + embedding) retrieval modes.
 *
 * Verifies:
 *   1. All "both" cases pass with both modes (regression guard)
 *   2. All "hybrid" cases pass with hybrid mode (when grepai is available)
 *   3. Hybrid mode recall >= keyword-only recall (no regression from RRF/blend)
 *
 * Run: node tests/test-hermes-retrieval-hybrid-eval.js
 * Run (json): node tests/test-hermes-retrieval-hybrid-eval.js --json
 */

const fs = require('fs');
const path = require('path');
const { retrieve } = require('../tools/hermes-retrieval-hybrid');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/semantic-cases.json');

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function checkRecall(matches, mustInclude, k) {
  const paths = matches.slice(0, k).map((m) => m.path);
  const missing = mustInclude.filter(
    (sub) => !paths.some((p) => p.includes(sub) || p.replace(/\\/g, '/').includes(sub)),
  );
  const hit = mustInclude.length - missing.length;
  return {
    recall: mustInclude.length ? hit / mustInclude.length : 1,
    missing,
    paths,
  };
}

function main(argv) {
  const jsonOutput = argv.includes('--json');
  if (!fs.existsSync(FIXTURE)) {
    console.error('Missing fixture: tests/fixtures/rag-eval/semantic-cases.json');
    process.exit(2);
  }

  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const cases = fixture.cases || [];

  // Detect if grepai/embedding is available
  let embeddingAvailable = false;
  try {
    const { getGrepaiDir } = require('../tools/hermes-retrieval-hybrid');
    const dir = getGrepaiDir();
    if (dir) {
      // Verify with a lightweight grepai call
      const { spawnSync } = require('child_process');
      const probe = spawnSync('grepai', ['search', 'retrieval', '--json', '--limit', '1'], {
        cwd: dir, encoding: 'utf8', maxBuffer: 1024 * 1024,
      });
      if (probe.status === 0 && probe.stdout.trim().startsWith('[')) {
        embeddingAvailable = true;
      }
    }
  } catch (e) {
    embeddingAvailable = false;
  }

  const results = [];
  const kwPass = [];
  const hyPass = [];

  for (const testCase of cases) {
    const mode = testCase.mode || 'hybrid';
    const k = testCase.k || 8;

    // Skip keyword-only check if case is hybrid-only and we already know kw fails
    let kwResult, hyResult;
    let kwRecall = 0;
    let hyRecall = 0;

    try {
      kwResult = retrieve(testCase.query, { skipEmbedding: true, limit: k * 2, maxFiles: 5000 });
      kwRecall = checkRecall(kwResult.matches, testCase.mustIncludePathSubstrings, k).recall;
      kwPass.push({ id: testCase.id, recall: kwRecall, pass: kwRecall === 1 });
    } catch (e) {
      kwPass.push({ id: testCase.id, recall: 0, pass: false, error: e.message });
    }

    if (!testCase.requiredBackends || testCase.requiredBackends === 'both' || embeddingAvailable) {
      try {
        hyResult = retrieve(testCase.query, { skipEmbedding: false, limit: k * 2, maxFiles: 5000, mode });
        hyRecall = checkRecall(hyResult.matches, testCase.mustIncludePathSubstrings, k).recall;
        hyPass.push({ id: testCase.id, recall: hyRecall, pass: hyRecall === 1 });
      } catch (e) {
        hyPass.push({ id: testCase.id, recall: 0, pass: false, error: e.message });
      }
    } else {
      skipped++;
      hyPass.push({ id: testCase.id, recall: 0, pass: false, skipped: true, reason: 'grepai unavailable' });
    }

    const kwEntry = kwPass[kwPass.length - 1];
    const hyEntry = hyPass[hyPass.length - 1];

    results.push({
      id: testCase.id,
      query: testCase.query,
      requiredBackends: testCase.requiredBackends || 'both',
      k,
      keyword: { recall: kwEntry.recall, pass: kwEntry.pass, error: kwEntry.error },
      hybrid: { recall: hyEntry.recall, pass: hyEntry.pass, error: hyEntry.error, skipped: hyEntry.skipped },
      embeddingAvailable,
    });
  }

  // Assertions
  const failures = [];

  for (const r of results) {
    const tc = cases.find((c) => c.id === r.id);

    if (r.requiredBackends === 'both') {
      // Both backends should pass at k
      if (!r.keyword.pass) {
        failures.push(`[${r.id}] keyword-only should pass (recall=${r.keyword.recall}) but didn't`);
      }
      if (!r.hybrid.pass && !r.hybrid.skipped) {
        failures.push(`[${r.id}] hybrid should pass (recall=${r.hybrid.recall}) but didn't`);
      }
    } else if (r.requiredBackends === 'keyword') {
      // Keyword-only should pass; hybrid should not regress beyond noRegressionK
      if (!r.keyword.pass) {
        failures.push(`[${r.id}] keyword-only should pass (recall=${r.keyword.recall}) but didn't`);
      }
      if (!r.hybrid.skipped) {
        const noRegK = tc.noRegressionK || k * 2;
        if (!r.hybrid.pass) {
          const hyResult2 = retrieve(tc.query, {
            skipEmbedding: false, limit: noRegK * 2, maxFiles: 5000, mode: tc.mode || 'hybrid',
          });
          const hyRecall2 = checkRecall(hyResult2.matches, tc.mustIncludePathSubstrings, noRegK).recall;
          if (hyRecall2 < r.keyword.recall) {
            failures.push(`[${r.id}] hybrid recall (${hyRecall2}) < keyword recall (${r.keyword.recall}) at k=${noRegK} — regression!`);
          }
        }
      }
    } else if (r.requiredBackends === 'hybrid') {
      // Keyword-only may or may not pass; hybrid should pass (when embedding available)
      // Note: not a failure if keyword also passes
      if (!r.hybrid.pass && !r.hybrid.skipped) {
        failures.push(`[${r.id}] hybrid should pass (recall=${r.hybrid.recall}) but didn't`);
      }
    }
  }

  // No-regression: hybrid recall >= keyword recall for all applicable cases
  // (uses the standard k, not noRegressionK — keyword-only files at risk of
  // displacement by embedding-boosted results get noRegressionK protection instead)

  // No-regression at standard k: hybrid recall >= keyword recall for "both" cases
  // (keyword-only cases use noRegressionK for regression protection)
  for (const r of results) {
    if (r.requiredBackends === 'both' && !r.hybrid.skipped && r.hybrid.recall < r.keyword.recall) {
      failures.push(
        `[${r.id}] hybrid recall (${r.hybrid.recall}) < keyword recall (${r.keyword.recall}) — regression!`,
      );
    }
  }

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          ok: failures.length === 0,
          embeddingAvailable,
          caseCount: cases.length,
          passed: results.filter((r) => r.hybrid.pass && !r.hybrid.skipped).length,
          skipped,
          failures: failures.length,
          results,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `Hybrid retrieval eval: ${results.filter((r) => r.hybrid.pass).length}/${results.length} hybrid-pass · ` +
        `${results.filter((r) => r.keyword.pass).length}/${results.length} keyword-pass · ` +
        `${skipped} skipped (no grepai) · ${failures.length} failures`,
    );
    console.log(`Embedding available: ${embeddingAvailable ? 'yes' : 'no'}`);
    console.log('');

    for (const r of results) {
      const tc = cases.find((c) => c.id === r.id);
      const kwMark = r.keyword.pass ? '✔' : '✗';
      const hyMark = r.hybrid.skipped ? '–' : r.hybrid.pass ? '✔' : '✗';
      const targetPath = tc.mustIncludePathSubstrings[0];
      console.log(
        `  [kw:${kwMark} hy:${hyMark}] ${r.id}  (target: ${targetPath})\n` +
          `    kw recall=${r.keyword.recall.toFixed(2)}  hy recall=${r.hybrid.skipped ? 'n/a' : r.hybrid.recall.toFixed(2)}`,
      );
    }

    if (failures.length > 0) {
      console.log('\n  Failures:');
      for (const f of failures) {
        console.log(`    ✗ ${f}`);
        failed += 1;
      }
    }
  }

  process.exit(failures.length === 0 ? 0 : 1);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

// For import in other tests
module.exports = { checkRecall, main };
