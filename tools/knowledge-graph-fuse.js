#!/usr/bin/env node
'use strict';

/**
 * Always-fused code retrieval: search hits + bounded graphify traversal.
 *
 * Steal (Towards Data Science, 2026-08-20, Cekikj): retrieval quality is a
 * property of the system, not of the question's wording. Traversal is a fixed
 * stage, not a router. Time is a filter (graphify AST edges have no validity
 * window — reported honestly). The contradiction gate still declines to settle.
 *
 * Not cloned: Cosmos Gremlin, Azure, insurance ontology, LLM entity resolution.
 *
 *   node tools/knowledge-graph-fuse.js --hits-file hits.json --graph graph.json --json
 *   node tools/knowledge-graph-fuse.js --hits-file hits.json --ablate --json
 */

const fs = require('fs');
const path = require('path');
const { rrfFuse } = require('./retrieval-rrf');

const SCHEMA = 'knowledge-graph-fuse/bundle-v1';
const DEFAULT_HOPS = 1;
const DEFAULT_FANOUT = 16;
const DEFAULT_MAX_PATHS = 24;
const DEFAULT_GRAPH = path.join(__dirname, '..', 'graphify-out', 'graph.json');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    hits: [],
    hitsFile: '',
    graph: DEFAULT_GRAPH,
    hops: DEFAULT_HOPS,
    fanout: DEFAULT_FANOUT,
    maxPaths: DEFAULT_MAX_PATHS,
    json: false,
    ablate: false,
    asOf: '',
    help: false,
    repo: path.resolve(__dirname, '..'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--hits-file') args.hitsFile = requireValue(argv, ++i, a);
    else if (a === '--hits') args.hits = JSON.parse(requireValue(argv, ++i, a));
    else if (a === '--graph') args.graph = requireValue(argv, ++i, a);
    else if (a === '--hops') args.hops = positiveInt(requireValue(argv, ++i, a), a, 2);
    else if (a === '--fanout') args.fanout = positiveInt(requireValue(argv, ++i, a), a, 64);
    else if (a === '--max-paths') args.maxPaths = positiveInt(requireValue(argv, ++i, a), a, 64);
    else if (a === '--json') args.json = true;
    else if (a === '--ablate') args.ablate = true;
    else if (a === '--as-of') args.asOf = requireValue(argv, ++i, a);
    else if (a === '--repo') args.repo = path.resolve(requireValue(argv, ++i, a));
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function positiveInt(raw, flag, max) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new Error(`${flag} must be an integer from 1 to ${max}`);
  }
  return n;
}

function usage() {
  return [
    'knowledge-graph-fuse — always traverse; never route by question wording',
    '',
    '  --hits-file PATH   JSON array of {path, rank?} search hits (anchors)',
    '  --hits JSON        inline hits',
    '  --graph PATH       graphify graph.json (nodes + links)',
    '  --hops 1|2         bounded traversal (default 1)',
    '  --ablate           also report search-only vs fused (acceptance test)',
    '  --as-of ISO        time is a FILTER; graphify AST edges have no window',
    '  --json',
    '',
    'No Cosmos/Gremlin. No search-only caller mode (ablate is the experiment).',
  ].join('\n');
}

function normalizePath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
}

function loadHits(args) {
  if (args.hitsFile) {
    const raw = JSON.parse(fs.readFileSync(args.hitsFile, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.hits || raw.matches || [];
    return list.map((h, i) => ({
      path: normalizePath(h.path || h.file || ''),
      rank: Number(h.rank) > 0 ? Number(h.rank) : i + 1,
      source: h.source || 'search',
    })).filter((h) => h.path);
  }
  return (args.hits || []).map((h, i) => ({
    path: normalizePath(h.path || ''),
    rank: Number(h.rank) > 0 ? Number(h.rank) : i + 1,
    source: h.source || 'search',
  })).filter((h) => h.path);
}

function loadGraph(graphPathOrObject) {
  if (graphPathOrObject && typeof graphPathOrObject === 'object' && Array.isArray(graphPathOrObject.nodes)) {
    return graphPathOrObject;
  }
  const graphPath = String(graphPathOrObject || '');
  if (!graphPath || !fs.existsSync(graphPath)) return null;
  const st = fs.lstatSync(graphPath);
  if (!st.isFile() || st.isSymbolicLink()) throw new Error('graph must be a regular file');
  return JSON.parse(fs.readFileSync(graphPath, 'utf8'));
}

function indexGraph(graph) {
  const nodes = new Map();
  const fileIndex = new Map();
  const adj = new Map();
  if (!graph) return { nodes, fileIndex, adj, available: false, nodeCount: 0, linkCount: 0 };
  for (const node of graph.nodes || []) {
    if (!node || !node.id) continue;
    nodes.set(node.id, node);
    const file = normalizePath(node.source_file);
    if (!file) continue;
    if (!fileIndex.has(file)) fileIndex.set(file, []);
    fileIndex.get(file).push(node.id);
  }
  const links = graph.links || graph.edges || [];
  for (const link of links) {
    if (!link || !link.source || !link.target) continue;
    const rel = String(link.relation || 'related_to');
    const srcFile = normalizePath(link.source_file || '');
    if (!adj.has(link.source)) adj.set(link.source, []);
    adj.get(link.source).push({ peer: link.target, relation: rel, sourceFile: srcFile, dir: 'out' });
    if (!adj.has(link.target)) adj.set(link.target, []);
    adj.get(link.target).push({ peer: link.source, relation: rel, sourceFile: srcFile, dir: 'in' });
  }
  return {
    nodes,
    fileIndex,
    adj,
    available: true,
    nodeCount: nodes.size,
    linkCount: links.length,
  };
}

function anchorsForHits(hits, index) {
  const out = [];
  for (const hit of hits) {
    const ids = index.fileIndex.get(hit.path) || [];
    out.push({ path: hit.path, entityIds: ids.slice(0, 8) });
  }
  return out;
}

function traverse(hits, index, options = {}) {
  const hops = options.hops || DEFAULT_HOPS;
  const fanout = options.fanout || DEFAULT_FANOUT;
  const maxPaths = options.maxPaths || DEFAULT_MAX_PATHS;
  const paths = [];
  const extraFiles = new Map();
  const contradictions = [];
  if (!index.available) {
    return { paths, extraFiles, contradictions, hopsAttempted: hops };
  }

  const startIds = [];
  for (const hit of hits) {
    for (const id of index.fileIndex.get(hit.path) || []) startIds.push(id);
  }
  const seenEdge = new Set();
  let frontier = [...new Set(startIds)];
  const hitFiles = new Set(hits.map((h) => h.path));

  for (let depth = 1; depth <= hops && frontier.length && paths.length < maxPaths; depth += 1) {
    const next = [];
    for (const id of frontier) {
      const edges = index.adj.get(id) || [];
      let used = 0;
      for (const edge of edges) {
        if (used >= fanout || paths.length >= maxPaths) break;
        const key = `${id}|${edge.relation}|${edge.peer}|${edge.dir}`;
        if (seenEdge.has(key)) continue;
        seenEdge.add(key);
        const peer = index.nodes.get(edge.peer);
        const from = index.nodes.get(id);
        const fromFile = normalizePath(from && from.source_file);
        const toFile = normalizePath(peer && peer.source_file);
        if (!toFile) continue;
        const crossFile = Boolean(fromFile && toFile && fromFile !== toFile);
        // Intra-file contains/defines edges are real but must not consume the
        // hop budget — otherwise 1-hop never leaves the search hit (live graphify).
        if (!crossFile && paths.length >= 4) continue;
        used += 1;
        const pathObj = {
          from: fromFile || id,
          to: toFile,
          relation: edge.relation,
          hop: depth,
          fromId: id,
          toId: edge.peer,
        };
        paths.push(pathObj);
        if (/contradict/i.test(edge.relation)) {
          contradictions.push({
            a: fromFile || id,
            b: toFile,
            relation: edge.relation,
          });
        }
        if (!crossFile) continue;
        if (!hitFiles.has(toFile)) {
          const prev = extraFiles.get(toFile);
          if (!prev || depth < prev.hop) extraFiles.set(toFile, { path: toFile, hop: depth });
        }
        next.push(edge.peer);
      }
    }
    frontier = [...new Set(next)];
  }
  return { paths, extraFiles, contradictions, hopsAttempted: hops };
}

function fuseBundle(hits, traversal, options = {}) {
  const graphItems = [...traversal.extraFiles.values()].map((f) => ({
    path: f.path,
    rank: f.hop,
    source: 'graph',
  }));
  const searchItems = hits.map((h) => ({
    path: h.path,
    rank: h.rank,
    source: h.source || 'search',
  }));
  const fused = rrfFuse(
    [
      { items: searchItems, source: 'search', weight: 1.0 },
      { items: graphItems, source: 'graph', weight: 1.15 },
    ],
    { k: 60, query: options.query || '' },
  );
  return fused;
}

function buildReport(options = {}) {
  const hits = options.hits || [];
  const index = options.index || indexGraph(options.graph || null);
  const traversal = traverse(hits, index, options);
  const matches = fuseBundle(hits, traversal, options);
  const searchFiles = hits.map((h) => h.path);
  const fusedFiles = matches.map((m) => m.path);
  const extraFromGraph = [...traversal.extraFiles.keys()];
  const report = {
    schema: SCHEMA,
    routed: false,
    fused: true,
    graphAvailable: index.available,
    nodeCount: index.nodeCount,
    linkCount: index.linkCount,
    hops: traversal.hopsAttempted,
    anchors: anchorsForHits(hits, index),
    paths: traversal.paths,
    contradictions: traversal.contradictions,
    declinesToSettle: traversal.contradictions.length > 0,
    matches,
    time: {
      isFilter: true,
      asOf: options.asOf || null,
      applied: false,
      reason: options.asOf
        ? 'graphify-ast-edges-have-no-validity-window'
        : 'not-requested',
    },
    paidLlm: false,
    clonedGremlin: false,
  };
  if (options.ablate) {
    report.ablation = {
      searchOnlyFileCount: searchFiles.length,
      fusedFileCount: fusedFiles.length,
      extraFromGraphCount: extraFromGraph.length,
      extraFromGraph,
      searchOnlyPathCount: 0,
      fusedPathCount: traversal.paths.length,
    };
  }
  return report;
}

function formatText(report) {
  const lines = [
    `KNOWLEDGE_GRAPH_FUSE schema=${report.schema} routed=${report.routed} fused=${report.fused}`,
    `graph available=${report.graphAvailable} nodes=${report.nodeCount} links=${report.linkCount} hops=${report.hops}`,
    `matches=${(report.matches || []).length} paths=${(report.paths || []).length} contradictions=${(report.contradictions || []).length}`,
    `gate declinesToSettle=${report.declinesToSettle} time=${report.time.reason}`,
  ];
  for (const p of (report.paths || []).slice(0, 8)) {
    lines.push(`  ${p.from} -${p.relation}-> ${p.to} (hop ${p.hop})`);
  }
  if (report.ablation) {
    lines.push(
      `ablation search_files=${report.ablation.searchOnlyFileCount} fused_files=${report.ablation.fusedFileCount} extra_graph=${report.ablation.extraFromGraphCount} fused_paths=${report.ablation.fusedPathCount}`,
    );
  }
  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`knowledge-graph-fuse: ${err.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const hits = loadHits(args);
  if (!hits.length) {
    process.stderr.write('knowledge-graph-fuse: provide --hits-file or --hits\n');
    process.exitCode = 2;
    return;
  }
  let graph = null;
  try {
    graph = loadGraph(args.graph);
  } catch (err) {
    process.stderr.write(`knowledge-graph-fuse: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }
  const report = buildReport({
    hits,
    graph,
    hops: args.hops,
    fanout: args.fanout,
    maxPaths: args.maxPaths,
    ablate: args.ablate,
    asOf: args.asOf,
  });
  process.stdout.write(args.json ? `${JSON.stringify(report)}\n` : `${formatText(report)}\n`);
}

module.exports = {
  SCHEMA,
  parseArgs,
  normalizePath,
  loadGraph,
  indexGraph,
  traverse,
  fuseBundle,
  buildReport,
  main,
};

if (require.main === module) main();
