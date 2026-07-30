#!/usr/bin/env node
'use strict';

/**
 * Offline retrieval evaluation for the local RAG stack (hermes-retrieval-harness).
 *
 * Measures recall@k against fixed fixtures — not live ThumbGate MCP (auth-bound).
 * Exit 0 when all cases hit required path substrings within top-k.
 *
 *   node tools/rag-retrieval-eval.js
 *   node tools/rag-retrieval-eval.js --json
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ndcgAtK } = require('./ml-core');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/cases.json');
const RETRIEVE = path.join(REPO, 'tools/hermes-retrieval-harness.js');

function parseArgs(argv) {
  const args = { fixture: DEFAULT_FIXTURE, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--fixture') args.fixture = path.resolve(argv[++i] || '');
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function runRetrieve(query, limit) {
  const result = spawnSync(
    process.execPath,
    [RETRIEVE, 'retrieve', '--query', query, '--limit', String(limit), '--json'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
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

function evaluateCase(testCase) {
  const k = testCase.k || 8;
  const run = runRetrieve(testCase.query, k);
  if (!run.ok) {
    return {
      id: testCase.id,
      pass: false,
      k,
      recallAtK: 0,
      missing: testCase.mustIncludePathSubstrings || [],
      paths: [],
      error: run.error,
    };
  }
  const required = testCase.mustIncludePathSubstrings || [];
  const missing = required.filter(
    (sub) => !run.paths.some((p) => p.includes(sub) || p.replace(/\\/g, '/').includes(sub)),
  );
  const hit = required.length - missing.length;
  const recallAtK = required.length ? hit / required.length : 1;
  const ndcg = ndcgAtK(run.paths, required, k);
  return {
    id: testCase.id,
    pass: missing.length === 0,
    k,
    recallAtK,
    ndcgAtK: ndcg,
    missing,
    paths: run.paths.slice(0, k),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/rag-retrieval-eval.js [--fixture PATH] [--json]`);
    process.exit(0);
  }
  if (!fs.existsSync(RETRIEVE)) {
    console.error('missing tools/hermes-retrieval-harness.js');
    process.exit(2);
  }
  const fixture = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
  const cases = fixture.cases || [];
  const results = cases.map(evaluateCase);
  const passCount = results.filter((r) => r.pass).length;
  const meanRecall =
    results.length === 0
      ? 0
      : results.reduce((sum, r) => sum + r.recallAtK, 0) / results.length;
  const meanNdcg =
    results.length === 0
      ? 0
      : results.reduce((sum, r) => sum + (r.ndcgAtK || 0), 0) / results.length;
  const report = {
    ok: passCount === results.length && results.length > 0,
    fixture: path.relative(REPO, args.fixture),
    caseCount: results.length,
    passCount,
    meanRecallAtK: Number(meanRecall.toFixed(4)),
    meanNdcgAtK: Number(meanNdcg.toFixed(4)),
    results,
  };
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `RAG retrieval eval: ${passCount}/${results.length} cases pass · mean recall@k=${report.meanRecallAtK} · mean nDCG@k=${report.meanNdcgAtK}`,
    );
    for (const r of results) {
      const mark = r.pass ? 'PASS' : 'FAIL';
      console.log(
        `  [${mark}] ${r.id} recall@${r.k}=${r.recallAtK.toFixed(2)} nDCG=${(r.ndcgAtK || 0).toFixed(2)}${r.error ? ` · ${r.error}` : ''}`,
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

module.exports = { evaluateCase, runRetrieve, parseArgs, ndcgAtK };
