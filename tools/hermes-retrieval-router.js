#!/usr/bin/env node
'use strict';

/**
 * Hermes Retrieval Router — pre-action safety gate that picks graph vs
 * keyword/hybrid backends before an agent spends cloud tokens.
 *
 * Pipeline:
 *   1. hermes-graph-rag.classifyQuery (entity | multi_hop | semantic)
 *   2. Always-local graph retrieve when gate.runGraph
 *   3. Keyword harness when gate.runKeyword (dependency-free)
 *   4. Optional hybrid (if tools/hermes-retrieval-hybrid.js is present)
 *
 * Usage:
 *   node tools/hermes-retrieval-router.js --query "how does X relate to Y" --json
 *   node tools/hermes-retrieval-router.js gate --query "what is thumbgate" --json
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const graphRag = require('./hermes-graph-rag.js');

let harness = null;
try {
  harness = require('./hermes-retrieval-harness.js');
} catch {
  harness = null;
}

let hybrid = null;
try {
  // Optional — may not be on every branch
  // eslint-disable-next-line import/no-unresolved
  hybrid = require('./hermes-retrieval-hybrid.js');
} catch {
  hybrid = null;
}

function rrfMerge(lists, k = 60) {
  const scores = new Map();
  const meta = new Map();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const p = item.path;
      if (!p) return;
      const add = 1 / (k + rank + 1);
      scores.set(p, (scores.get(p) || 0) + add);
      const prev = meta.get(p) || {
        path: p,
        snippet: item.snippet || '',
        sources: [],
        reasons: [],
      };
      for (const s of item.sources || [item.source].filter(Boolean)) {
        if (!prev.sources.includes(s)) prev.sources.push(s);
      }
      for (const r of item.reasons || []) {
        if (!prev.reasons.includes(r)) prev.reasons.push(r);
      }
      if (!prev.snippet && item.snippet) prev.snippet = item.snippet;
      meta.set(p, prev);
    });
  }
  return [...scores.entries()]
    .map(([p, score]) => ({ ...meta.get(p), score: Number(score.toFixed(6)) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function routeRetrieve(query, options = {}) {
  const repo = path.resolve(options.repo || REPO);
  const limit = options.limit || 8;
  const storeRoot = options.storeRoot;

  // Ensure graph index exists (cheap mtime incremental)
  const index = graphRag.loadIndex(repo, storeRoot);
  if (!Object.keys(index.files || {}).length) {
    graphRag.buildIndex(repo, {
      storeRoot,
      vault: options.vault,
      graphify: options.graphify !== false,
      maxFiles: options.maxFiles || 2000,
    });
  }

  const classification = graphRag.classifyQuery(query, graphRag.loadIndex(repo, storeRoot));
  const gate = classification.gate;

  const lists = [];
  const backends = { gate: classification.mode };

  if (gate.runGraph || options.forceGraph) {
    const g = graphRag.retrieve(query, {
      repo,
      storeRoot,
      limit: limit * 2,
      depth: classification.depth,
      vault: options.vault,
      graphify: options.graphify !== false,
    });
    lists.push(
      (g.matches || []).map((m) => ({
        ...m,
        sources: [...(m.sources || []), 'graph'],
      })),
    );
    backends.graph = { count: (g.matches || []).length, seeds: g.seeds };
  }

  if (gate.runKeyword && harness && typeof harness.retrieve === 'function') {
    try {
      const kw = harness.retrieve(query, { repo, limit: limit * 2 });
      lists.push(
        (kw.matches || []).map((m) => ({
          path: m.path,
          score: m.score,
          snippet: m.snippet,
          sources: ['keyword'],
          reasons: m.reasons || [],
        })),
      );
      backends.keyword = { count: (kw.matches || []).length };
    } catch (error) {
      backends.keyword = { error: error.message };
    }
  }

  if (gate.runEmbedding && hybrid && typeof hybrid.retrieve === 'function' && !options.skipHybrid) {
    try {
      const hy = hybrid.retrieve(query, {
        repo,
        limit: limit * 2,
        skipEmbedding: options.skipEmbedding,
      });
      lists.push(
        (hy.matches || []).map((m) => ({
          path: m.path,
          score: m.score,
          snippet: m.snippet,
          sources: m.sources || ['hybrid'],
          reasons: m.reasons || [],
        })),
      );
      backends.hybrid = { count: (hy.matches || []).length, available: true };
    } catch (error) {
      backends.hybrid = { error: error.message, available: false };
    }
  } else if (gate.runEmbedding && !hybrid) {
    backends.hybrid = { available: false, reason: 'hermes-retrieval-hybrid.js not present' };
  }

  const fused = rrfMerge(lists).slice(0, limit).map((m, i) => ({ ...m, rank: i + 1 }));

  return {
    query,
    classification,
    matches: fused,
    backends,
    spendHint: gate.skipExternalLlmForLookup
      ? 'NO_CLOUD_RETRIEVAL — entity graph answer sufficient'
      : 'LOCAL_RETRIEVAL_OK — synthesize with cheapest capable local/cloud model only if needed',
  };
}

function parseArgs(argv) {
  const args = {
    command: 'retrieve',
    query: '',
    repo: REPO,
    limit: 8,
    json: false,
    vault: process.env.HERMES_GRAPH_RAG_VAULT || '',
    skipHybrid: false,
    skipEmbedding: false,
    help: false,
  };
  if (argv[0] && !argv[0].startsWith('--')) args.command = argv.shift();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--query') args.query = argv[++i] || '';
    else if (a === '--repo') args.repo = path.resolve(argv[++i] || REPO);
    else if (a === '--limit') args.limit = Number(argv[++i] || 8);
    else if (a === '--vault') args.vault = argv[++i] || '';
    else if (a === '--skip-hybrid') args.skipHybrid = true;
    else if (a === '--skip-embedding') args.skipEmbedding = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!args.query) args.query = a;
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage: node tools/hermes-retrieval-router.js [retrieve|gate] --query "..." [--json]`);
    process.exit(0);
  }
  if (!args.query) {
    console.error('--query required');
    process.exit(1);
  }

  if (args.command === 'gate' || args.command === 'classify') {
    const index = graphRag.loadIndex(args.repo);
    if (!Object.keys(index.files || {}).length) {
      graphRag.buildIndex(args.repo, {
        vault: args.vault || undefined,
        graphify: true,
        maxFiles: 2000,
      });
    }
    const c = graphRag.classifyQuery(args.query, graphRag.loadIndex(args.repo));
    console.log(JSON.stringify(c, null, 2));
    process.exit(0);
  }

  const result = routeRetrieve(args.query, {
    repo: args.repo,
    limit: args.limit,
    vault: args.vault || undefined,
    skipHybrid: args.skipHybrid,
    skipEmbedding: args.skipEmbedding,
  });
  console.log(JSON.stringify(result, null, args.json ? 2 : 0));
}

if (require.main === module) {
  main();
}

module.exports = { routeRetrieve, rrfMerge };
