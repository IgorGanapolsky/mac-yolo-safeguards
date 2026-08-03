#!/usr/bin/env node
'use strict';

/**
 * Offline retrieval evaluation for the local RAG stack.
 *
 * Metrics: Recall@K, MRR@K, nDCG@K, Precision@K (binary path-substring labels).
 *
 * Retrievers:
 *   harness   — tools/hermes-retrieval-harness.js (default, CI-fast)
 *   dual-path — RRF + optional rewrite (no live embed rerank by default)
 *   dual-rerank — dual-path with ensemble rerank (slow; needs Ollama)
 *
 *   node tools/rag-retrieval-eval.js
 *   node tools/rag-retrieval-eval.js --json
 *   node tools/rag-retrieval-eval.js --retriever dual-path --json
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ndcgAtK, mrrAtK, precisionAtK, recallAtK } = require('./ml-core');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/cases.json');
const RETRIEVE = path.join(REPO, 'tools', 'hermes-retrieval-harness.js');
const DUAL = path.join(REPO, 'tools', 'retrieval-dual-path.js');

function parseArgs(argv) {
  const args = {
    fixture: DEFAULT_FIXTURE,
    json: false,
    help: false,
    retriever: 'harness', // harness | dual-path | dual-rerank
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--fixture') args.fixture = path.resolve(argv[++i] || '');
    else if (a === '--retriever') args.retriever = argv[++i] || 'harness';
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function runHarness(query, limit) {
  const result = spawnSync(
    process.execPath,
    [RETRIEVE, 'retrieve', '--query', query, '--limit', String(limit), '--json'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000 },
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

function runDualPath(query, limit, withRerank) {
  const args = [
    DUAL,
    '--query',
    query,
    '--limit',
    String(limit),
    '--candidate-pool',
    String(Math.max(limit, withRerank ? 12 : 20)),
    '--json',
  ];
  if (withRerank) {
    args.push('--rerank', 'ensemble');
  } else {
    args.push('--no-rerank');
  }
  const result = spawnSync(process.execPath, args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: withRerank ? 300000 : 120000,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `exit ${result.status}`).trim().slice(0, 300),
      paths: [],
    };
  }
  try {
    const body = JSON.parse(result.stdout);
    const hits = body.matches || [];
    const paths = hits.map((hit) => hit.path || '').filter(Boolean);
    return { ok: true, paths, raw: body };
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error.message}`, paths: [] };
  }
}

function runRetrieve(query, limit, retriever) {
  if (retriever === 'dual-path') return runDualPath(query, limit, false);
  if (retriever === 'dual-rerank') return runDualPath(query, limit, true);
  return runHarness(query, limit);
}

function evaluateCase(testCase, retriever) {
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
  const missing = required.filter(
    (sub) => !run.paths.some((p) => p.includes(sub) || p.replace(/\\/g, '/').includes(sub)),
  );
  return {
    id: testCase.id,
    pass: missing.length === 0,
    k,
    recallAtK: recallAtK(run.paths, required, k),
    mrrAtK: mrrAtK(run.paths, required, k),
    precisionAtK: precisionAtK(run.paths, required, k),
    ndcgAtK: ndcgAtK(run.paths, required, k),
    missing,
    paths: run.paths.slice(0, k),
  };
}

function mean(results, key) {
  if (!results.length) return 0;
  return results.reduce((sum, r) => sum + (Number(r[key]) || 0), 0) / results.length;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      `Usage: node tools/rag-retrieval-eval.js [--fixture PATH] [--retriever harness|dual-path|dual-rerank] [--json]`,
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
  const report = {
    ok: passCount === results.length && results.length > 0,
    fixture: path.relative(REPO, args.fixture),
    retriever: args.retriever,
    caseCount: results.length,
    passCount,
    meanRecallAtK: Number(mean(results, 'recallAtK').toFixed(4)),
    meanMrrAtK: Number(mean(results, 'mrrAtK').toFixed(4)),
    meanPrecisionAtK: Number(mean(results, 'precisionAtK').toFixed(4)),
    meanNdcgAtK: Number(mean(results, 'ndcgAtK').toFixed(4)),
    results,
  };
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `RAG retrieval eval [${args.retriever}]: ${passCount}/${results.length} pass · ` +
        `recall@k=${report.meanRecallAtK} mrr@k=${report.meanMrrAtK} ` +
        `P@k=${report.meanPrecisionAtK} nDCG@k=${report.meanNdcgAtK}`,
    );
    for (const r of results) {
      const mark = r.pass ? 'PASS' : 'FAIL';
      console.log(
        `  [${mark}] ${r.id} R=${r.recallAtK.toFixed(2)} MRR=${r.mrrAtK.toFixed(2)} ` +
          `P=${r.precisionAtK.toFixed(2)} nDCG=${(r.ndcgAtK || 0).toFixed(2)}` +
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
  runHarness,
  runDualPath,
  parseArgs,
  ndcgAtK,
  mrrAtK,
  precisionAtK,
  recallAtK,
};
