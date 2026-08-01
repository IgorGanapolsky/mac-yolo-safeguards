#!/usr/bin/env node
'use strict';

/**
 * Governed retrieval interface contracts (Monzo-style data mesh for RAG).
 *
 * InfoQ July 2026 (Monzo): defined modeling layers + explicit interface models
 * + CI-enforced validation beat ad-hoc warehouse sprawl.
 *
 * We apply the same idea to retrieval: each store is a product with a named
 * interface, required artifacts, and owners — not three silent folders that
 * may or may not agree.
 *
 * Usage:
 *   node tools/retrieval-interface-contracts.js --json
 *   node tools/retrieval-interface-contracts.js --check
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..');

/** @typedef {{ id: string, owner: string, layer: string, requiredPaths: string[], description: string }} InterfaceContract */

/** Canonical interfaces agents may depend on. */
const CONTRACTS = /** @type {InterfaceContract[]} */ ([
  {
    id: 'code.grepai',
    owner: 'fleet-repo-intelligence',
    layer: 'serving',
    requiredPaths: [
      path.join(os.homedir(), '.hermes', 'semantic-index', 'mac-yolo-safeguards', '.grepai', 'index.gob'),
    ],
    description: 'Hybrid BM25+dense code index (isolated clone)',
  },
  {
    id: 'code.harness',
    owner: 'hermes-retrieval-harness',
    layer: 'serving',
    requiredPaths: [path.join(REPO, 'tools', 'hermes-retrieval-harness.js')],
    description: 'Dependency-free sparse code walk (no store)',
  },
  {
    id: 'code.dual-path',
    owner: 'retrieval-dual-path',
    layer: 'serving',
    requiredPaths: [
      path.join(REPO, 'tools', 'retrieval-dual-path.js'),
      path.join(REPO, 'tools', 'retrieval-rrf.js'),
      path.join(REPO, 'tools', 'retrieval-query-rewrite.js'),
      path.join(REPO, 'tools', 'retrieval-rerank.js'),
    ],
    description: 'Weighted RRF fusion of harness + grepae + second-stage CE/ColBERT/LLM rerank',
  },
  {
    id: 'code.rerank',
    owner: 'retrieval-rerank',
    layer: 'serving',
    requiredPaths: [
      path.join(REPO, 'tools', 'retrieval-rerank.js'),
      path.join(REPO, 'tools', 'rerank-stack-scorecard.js'),
    ],
    description: 'Cross-encoder, ColBERT-lite MaxSim, and LLM listwise rerank',
  },
  {
    id: 'code.multi-query',
    owner: 'retrieval-multi-query',
    layer: 'serving',
    requiredPaths: [
      path.join(REPO, 'tools', 'retrieval-multi-query.js'),
      path.join(REPO, 'tools', 'retrieval-query-rewrite.js'),
    ],
    description: 'Deterministic multi-query expansion + RRF fuse (optional LLM paraphrases)',
  },
  {
    id: 'ops.retrieval-eval',
    owner: 'rag-retrieval-eval',
    layer: 'governance',
    requiredPaths: [
      path.join(REPO, 'tools', 'rag-retrieval-eval.js'),
      path.join(REPO, 'tools', 'ml-core.js'),
      path.join(REPO, 'tests', 'fixtures', 'rag-eval', 'cases.json'),
    ],
    description: 'Offline IR metrics: Recall@K, MRR@K, Precision@K, nDCG@K',
  },
  {
    id: 'lessons.sqlite',
    owner: 'thumbgate-lessons',
    layer: 'canonical',
    requiredPaths: [path.join(os.homedir(), '.thumbgate', 'lessons.sqlite')],
    description: 'Canonical lessons store (FTS source of truth)',
  },
  {
    id: 'lessons.jsonl',
    owner: 'thumbgate-lessons',
    layer: 'projection',
    requiredPaths: [path.join(os.homedir(), '.thumbgate', 'lessons-index.jsonl')],
    description: 'JSONL projection of lessons (must cover sqlite IDs)',
  },
  {
    id: 'lessons.embeddings',
    owner: 'thumbgate-lessons',
    layer: 'projection',
    requiredPaths: [path.join(os.homedir(), '.thumbgate', 'lesson-embeddings.json')],
    description: 'Neural lesson vectors (nomic / 384-d)',
  },
  {
    id: 'ops.scorecard',
    owner: 'rag-stack-scorecard',
    layer: 'governance',
    requiredPaths: [
      path.join(REPO, 'tools', 'rag-stack-scorecard.js'),
      path.join(REPO, 'tools', 'ingestion-integrity.js'),
    ],
    description: 'Hard-gate health + integrity for production RAG',
  },
  {
    id: 'research.academic',
    owner: 'hermes-academic-research',
    layer: 'serving',
    // Tool must exist; pack is machine-local (ingest LaunchAgent). Empty pack is a
    // retrieve-time miss, not a missing interface binary.
    requiredPaths: [path.join(REPO, 'tools', 'hermes-academic-research-retrieve.js')],
    description: 'Academic evidence pack retrieve path (queryable; not write-only)',
  },
]);

function parseArgs(argv) {
  const args = { json: false, check: true };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a === '--list') args.check = false;
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

function checkContract(c) {
  const missing = c.requiredPaths.filter((p) => !fs.existsSync(p));
  const sizes = {};
  for (const p of c.requiredPaths) {
    if (fs.existsSync(p)) {
      try {
        sizes[p] = fs.statSync(p).size;
      } catch {
        sizes[p] = null;
      }
    }
  }
  // Empty shells fail: grepae index.gob < 1KB, embeddings empty object
  const empty = [];
  for (const [p, size] of Object.entries(sizes)) {
    if (p.endsWith('index.gob') && size !== null && size < 1024) empty.push(p);
    if (p.endsWith('lesson-embeddings.json') && size !== null && size < 50) empty.push(p);
    if (p.endsWith('lessons.sqlite') && size !== null && size < 100) empty.push(p);
  }
  const ok = missing.length === 0 && empty.length === 0;
  return {
    id: c.id,
    owner: c.owner,
    layer: c.layer,
    ok,
    missing,
    empty,
    description: c.description,
  };
}

function validateInterfaces(options = {}) {
  const contracts = options.contracts || CONTRACTS;
  const results = contracts.map(checkContract);
  const failed = results.filter((r) => !r.ok);
  return {
    checkedAt: new Date().toISOString(),
    contractCount: results.length,
    failed: failed.length,
    ok: failed.length === 0,
    results,
    // Explicit interface surface for agents / scorecard
    interfaces: contracts.map((c) => ({
      id: c.id,
      owner: c.owner,
      layer: c.layer,
      description: c.description,
    })),
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log('Usage: node tools/retrieval-interface-contracts.js [--json] [--list]');
      process.exit(0);
    }
    const report = validateInterfaces();
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`retrieval interfaces: ${report.contractCount - report.failed}/${report.contractCount} ok`);
      for (const r of report.results) {
        console.log(`  ${r.ok ? 'OK' : 'FAIL'} ${r.id} (${r.layer}) owner=${r.owner}`);
        if (r.missing.length) console.log(`       missing: ${r.missing.join(', ')}`);
        if (r.empty.length) console.log(`       empty-shell: ${r.empty.join(', ')}`);
      }
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { CONTRACTS, validateInterfaces, checkContract };
