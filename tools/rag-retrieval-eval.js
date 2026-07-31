#!/usr/bin/env node
'use strict';

/**
 * Offline retrieval evaluation for the local RAG stack (hermes-retrieval-harness).
 *
 * Metrics (tools/rag-metrics.js):
 *   recall@k · precision@k · MRR · nDCG@k
 *
 * Exit 0 when all fixture cases hit required path substrings within top-k.
 *
 *   node tools/rag-retrieval-eval.js
 *   node tools/rag-retrieval-eval.js --json
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  scoreRanking,
  summarizeRetrievalResults,
  round4,
} = require('./rag-metrics');
// Re-export ml-core nDCG for callers that imported it from this module.
const { ndcgAtK } = require('./ml-core');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/cases.json');
const RETRIEVE = path.join(REPO, 'tools', 'hermes-retrieval-harness.js');

function parseArgs(argv) {
  const args = { fixture: DEFAULT_FIXTURE, json: false, help: false, rewrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--fixture') args.fixture = path.resolve(argv[++i] || '');
    else if (a === '--rewrite') args.rewrite = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function pathMatches(item, requiredSubstring) {
  const normalized = String(item).replace(/\\/g, '/');
  return normalized.includes(requiredSubstring);
}

function runRetrieve(query, limit, options = {}) {
  const args = [RETRIEVE, 'retrieve', '--query', query, '--limit', String(limit), '--json'];
  if (options.rewrite) args.push('--rewrite');
  const result = spawnSync(process.execPath, args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `exit ${result.status}`).trim(),
      paths: [],
    };
  }
  try {
    const body = JSON.parse(result.stdout);
    const hits = body.matches || body.results || body.hits || body.files || [];
    const paths = hits
      .map((hit) => hit.path || hit.relativePath || hit.file || '')
      .filter(Boolean);
    return { ok: true, paths, raw: body };
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error.message}`, paths: [] };
  }
}

function evaluateCase(testCase, options = {}) {
  const k = testCase.k || 8;
  const required = testCase.mustIncludePathSubstrings || [];
  const graded = testCase.gradedRelevance || {};
  const run = runRetrieve(testCase.query, k, options);
  if (!run.ok) {
    return {
      id: testCase.id,
      pass: false,
      k,
      recallAtK: 0,
      precisionAtK: 0,
      reciprocalRank: 0,
      ndcgAtK: 0,
      missing: required,
      paths: [],
      error: run.error,
    };
  }
  const paths = run.paths.slice(0, k);
  const score = scoreRanking(paths, required, pathMatches, { k, gradedRelevance: graded });
  // Keep ml-core nDCG as a cross-check field when binary labels only.
  const legacyNdcg = ndcgAtK(paths, required, k);
  return {
    id: testCase.id,
    pass: score.missing.length === 0,
    k: score.k,
    recallAtK: score.recallAtK,
    precisionAtK: score.precisionAtK,
    reciprocalRank: score.reciprocalRank,
    ndcgAtK: score.ndcgAtK,
    mlCoreNdcgAtK: legacyNdcg,
    missing: score.missing,
    paths,
  };
}

function buildReport(args) {
  const fixture = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
  const cases = fixture.cases || [];
  const results = cases.map((c) => evaluateCase(c, { rewrite: args.rewrite }));
  const summary = summarizeRetrievalResults(results);
  return {
    ok: summary.passCount === summary.caseCount && summary.caseCount > 0,
    fixture: path.relative(REPO, args.fixture),
    caseCount: summary.caseCount,
    passCount: summary.passCount,
    meanRecallAtK: summary.meanRecallAtK,
    meanPrecisionAtK: summary.meanPrecisionAtK,
    meanMRR: summary.meanMRR,
    // Alias used by rag-stack-scorecard (meanNdcgAtK)
    meanNdcgAtK: summary.meanNDCGAtK,
    meanNDCGAtK: summary.meanNDCGAtK,
    results: summary.results,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/rag-retrieval-eval.js [--fixture PATH] [--json] [--rewrite]');
    process.exit(0);
  }
  if (!fs.existsSync(RETRIEVE)) {
    console.error('missing tools/hermes-retrieval-harness.js');
    process.exit(2);
  }
  const report = buildReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `RAG retrieval eval: ${report.passCount}/${report.caseCount} pass · ` +
        `R@k=${report.meanRecallAtK} · P@k=${report.meanPrecisionAtK} · ` +
        `MRR=${report.meanMRR} · nDCG@k=${report.meanNdcgAtK}`,
    );
    for (const r of report.results) {
      const mark = r.pass ? 'PASS' : 'FAIL';
      console.log(
        `  [${mark}] ${r.id} R@${r.k}=${r.recallAtK.toFixed(2)} P=${r.precisionAtK.toFixed(2)} ` +
          `MRR=${r.reciprocalRank.toFixed(2)} nDCG=${r.ndcgAtK.toFixed(2)}` +
          `${r.error ? ` · ${r.error}` : ''}`,
      );
      if (r.missing?.length) console.log(`         missing: ${r.missing.join(', ')}`);
    }
  }
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = {
  evaluateCase,
  runRetrieve,
  parseArgs,
  buildReport,
  pathMatches,
  scoreRanking,
  ndcgAtK,
  round4,
};
