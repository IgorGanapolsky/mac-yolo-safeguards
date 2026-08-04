#!/usr/bin/env node
'use strict';

/**
 * Offline retrieval evaluation for the local RAG stack.
 *
 * Backends:
 *   harness   — hermes-retrieval-harness (default, CI-safe)
 *   dual-path — harness + grepae RRF + optional rerank
 *
 * Metrics: Recall@K, MRR@K, Precision@K, nDCG@K
 *
 *   node tools/rag-retrieval-eval.js
 *   node tools/rag-retrieval-eval.js --json
 *   node tools/rag-retrieval-eval.js --retriever dual-path --json
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ndcgAtK, mrrAtK } = require('./ml-core');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/cases.json');
const RETRIEVE = path.join(REPO, 'tools/hermes-retrieval-harness.js');
const DUAL = path.join(REPO, 'tools/retrieval-dual-path.js');

function parseArgs(argv) {
  const args = {
    fixture: DEFAULT_FIXTURE,
    json: false,
    help: false,
    retriever: 'harness',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--fixture') args.fixture = path.resolve(argv[++i] || '');
    else if (a === '--retriever') args.retriever = String(argv[++i] || 'harness');
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function precisionAtK(rankedPaths, relevantSubstrings, k) {
  const top = (rankedPaths || []).slice(0, k);
  if (!top.length) return 0;
  let hits = 0;
  for (const p of top) {
    const norm = String(p).replace(/\\/g, '/');
    if ((relevantSubstrings || []).some((sub) => norm.includes(sub))) hits += 1;
  }
  return hits / top.length;
}

function runRetrieveHarness(query, limit) {
  const result = spawnSync(
    process.execPath,
    [
      RETRIEVE,
      'retrieve',
      '--query',
      query,
      '--limit',
      String(limit),
      '--max-files',
      '12000',
      '--json',
    ],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 180000 },
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

function runRetrieveDualPath(query, limit) {
  if (!fs.existsSync(DUAL)) {
    return { ok: false, error: 'missing tools/retrieval-dual-path.js', paths: [] };
  }
  // IR metrics measure fusion quality — not second-stage CE/ColBERT (scored by
  // rerank-stack-scorecard). Ensemble can demote exact path hits and tank nDCG
  // while fusion alone matches harness goldens (measured 2026-08-04).
  // Empty grepae shell fail-fasts in runGrepai; dual-path degrades to harness.
  // Pull a slightly wider pool than K so grepae near-neighbors can't push a
  // harness@8-9 production path past the eval horizon (lessons-feedback flake).
  const retrieveLimit = Math.max(limit, Math.min(limit + 4, 16));
  const result = spawnSync(
    process.execPath,
    [
      DUAL,
      '--query',
      query,
      '--limit',
      String(retrieveLimit),
      '--candidate-pool',
      String(Math.max(retrieveLimit * 3, 24)),
      '--no-rerank',
      '--json',
    ],
    // Per-case budget: harness + grepae (≤15s default) + RRF. Keep under 60s.
    { cwd: REPO, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000 },
  );
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `exit ${result.status}`).trim().slice(0, 400),
      paths: [],
    };
  }
  try {
    const body = JSON.parse(result.stdout);
    const hits = body.matches || body.results || [];
    const paths = hits
      .map((hit) => hit.path || hit.relativePath || hit.file || '')
      .filter(Boolean);
    return { ok: true, paths, raw: body };
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error.message}`, paths: [] };
  }
}

function runRetrieve(query, limit, retriever = 'harness') {
  if (retriever === 'dual-path' || retriever === 'dual') {
    return runRetrieveDualPath(query, limit);
  }
  return runRetrieveHarness(query, limit);
}

function evaluateCase(testCase, retriever = 'harness') {
  const k = testCase.k || 8;
  const run = runRetrieve(testCase.query, k, retriever);
  if (!run.ok) {
    return {
      id: testCase.id,
      pass: false,
      k,
      recallAtK: 0,
      mrrAtK: 0,
      precisionAtK: 0,
      ndcgAtK: 0,
      missing: testCase.mustIncludePathSubstrings || [],
      paths: [],
      error: run.error,
    };
  }
  const required = testCase.mustIncludePathSubstrings || [];
  // Always grade against top-K only — dual-path may retrieve a slightly wider
  // pool for stability, but Recall@K/MRR/nDCG must not use ranks > K.
  const topK = (run.paths || []).slice(0, k);
  const missing = required.filter(
    (sub) => !topK.some((p) => p.includes(sub) || p.replace(/\\/g, '/').includes(sub)),
  );
  const hit = required.length - missing.length;
  const recallAtK = required.length ? hit / required.length : 1;
  const ndcg = ndcgAtK(topK, required, k);
  const mrr = mrrAtK(topK, required, k);
  const prec = precisionAtK(topK, required, k);
  return {
    id: testCase.id,
    pass: missing.length === 0,
    k,
    recallAtK,
    mrrAtK: mrr,
    precisionAtK: prec,
    ndcgAtK: ndcg,
    missing,
    paths: topK,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      `Usage: node tools/rag-retrieval-eval.js [--fixture PATH] [--retriever harness|dual-path] [--json]`,
    );
    process.exit(0);
  }
  if (!fs.existsSync(RETRIEVE)) {
    console.error('missing tools/hermes-retrieval-harness.js');
    process.exit(2);
  }
  const fixture = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
  const cases = fixture.cases || [];
  const results = cases.map((c) => evaluateCase(c, args.retriever));
  const passCount = results.filter((r) => r.pass).length;
  const meanRecall =
    results.length === 0
      ? 0
      : results.reduce((sum, r) => sum + r.recallAtK, 0) / results.length;
  const meanMrr =
    results.length === 0
      ? 0
      : results.reduce((sum, r) => sum + (r.mrrAtK || 0), 0) / results.length;
  const meanNdcg =
    results.length === 0
      ? 0
      : results.reduce((sum, r) => sum + (r.ndcgAtK || 0), 0) / results.length;
  const meanPrec =
    results.length === 0
      ? 0
      : results.reduce((sum, r) => sum + (r.precisionAtK || 0), 0) / results.length;
  const report = {
    ok: passCount === results.length && results.length > 0,
    retriever: args.retriever,
    fixture: path.relative(REPO, args.fixture),
    caseCount: results.length,
    passCount,
    meanRecallAtK: Number(meanRecall.toFixed(4)),
    meanMrrAtK: Number(meanMrr.toFixed(4)),
    meanPrecisionAtK: Number(meanPrec.toFixed(4)),
    meanNdcgAtK: Number(meanNdcg.toFixed(4)),
    results,
  };
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `RAG retrieval eval (${args.retriever}): ${passCount}/${results.length} cases pass · ` +
        `recall@k=${report.meanRecallAtK} · MRR@k=${report.meanMrrAtK} · ` +
        `P@k=${report.meanPrecisionAtK} · nDCG@k=${report.meanNdcgAtK}`,
    );
    for (const r of results) {
      const mark = r.pass ? 'PASS' : 'FAIL';
      console.log(
        `  [${mark}] ${r.id} R@${r.k}=${r.recallAtK.toFixed(2)} MRR=${(r.mrrAtK || 0).toFixed(2)} ` +
          `nDCG=${(r.ndcgAtK || 0).toFixed(2)}${r.error ? ` · ${r.error}` : ''}`,
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

module.exports = { evaluateCase, runRetrieve, parseArgs, ndcgAtK, precisionAtK };
