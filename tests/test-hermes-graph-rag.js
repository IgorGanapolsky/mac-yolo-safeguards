#!/usr/bin/env node
'use strict';

/**
 * Unit + fixture tests for tools/hermes-graph-rag.js
 * Pure Node, no network, uses a temp store + fixture corpus.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  extractFromText,
  classifyQuery,
  buildIndex,
  loadIndex,
  retrieve,
  matchEntities,
  bfsNeighbors,
  buildAdjacency,
  entityId,
  emptyIndex,
} = require('../tools/hermes-graph-rag.js');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-graph-rag-'));
const fixtureRepo = path.join(tmpRoot, 'repo');
const storeRoot = path.join(tmpRoot, 'store');

function write(rel, body) {
  const abs = path.join(fixtureRepo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

// ── fixture corpus ──────────────────────────────────────────────────
write(
  'docs/ops/leash.md',
  `# Hardware Leash

The [[thumbgate]] product uses the hardware leash for USB kill-switch.
See \`tools/hermes-hardware-leash.js\` and pair flow.

## Pair relation

Leash depends on pair-code validation before Continuity upsell.
`,
);
write(
  'docs/ops/continuity.md',
  `# Continuity

[[thumbgate]] Continuity is the paid VPS failover offer.
It relates to leash only after the Mac is reachable.

## Ownership

Owned by revenue lane; blocked by offline Mac state.
`,
);
write(
  'coordination/example-claim.md',
  `# Claim

Agent owns \`tools/hermes-graph-rag.js\` for graph rag work.
Tags: #graph-rag #retrieval
`,
);
write(
  'AGENTS.md',
  `# Agents

Use hermes retrieval hybrid before cloud calls.
`,
);

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ok - ${name}`);
}

// 1. extractFromText
{
  const text = fs.readFileSync(path.join(fixtureRepo, 'docs/ops/leash.md'), 'utf8');
  const ex = extractFromText(text, 'docs/ops/leash.md');
  assert.ok(ex.nodes.some((n) => n.id === entityId('thumbgate')), 'wiki entity thumbgate');
  assert.ok(ex.nodes.some((n) => /hardware leash/i.test(n.label)), 'heading section');
  assert.ok(ex.edges.some((e) => e.relation === 'links_to' || e.relation === 'mentions'), 'edges present');
  assert.ok(ex.chunks.length >= 1, 'chunks extracted');
  ok('extractFromText wiki+heading+chunks');
}

// 2. incremental index
{
  const r1 = buildIndex(fixtureRepo, {
    storeRoot,
    force: true,
    graphify: false,
    maxFiles: 50,
  });
  assert.equal(r1.ok, true);
  assert.ok(r1.stats.nodes > 0, 'nodes > 0');
  assert.ok(r1.stats.chunks > 0, 'chunks > 0');
  assert.ok(r1.updated >= 3, `updated files, got ${r1.updated}`);

  const r2 = buildIndex(fixtureRepo, {
    storeRoot,
    force: false,
    graphify: false,
    maxFiles: 50,
  });
  assert.equal(r2.ok, true);
  assert.ok(r2.skipped >= 3, `incremental skip, skipped=${r2.skipped}`);
  assert.equal(r2.updated, 0, 'no updates on second pass');
  ok('incremental index mtime skip');
}

// 3. classify gate — entity vs multi-hop
{
  const index = loadIndex(fixtureRepo, storeRoot);
  const ent = classifyQuery('what is thumbgate', index);
  assert.ok(['entity', 'semantic'].includes(ent.mode), `entity-ish mode got ${ent.mode}`);
  assert.ok(ent.entities.some((e) => e.id.includes('thumbgate')), 'matched thumbgate entity');
  assert.equal(ent.gate.preferredBackend === 'graph' || ent.gate.runGraph, true);

  const multi = classifyQuery('how does leash relate to continuity', index);
  assert.equal(multi.mode, 'multi_hop', `expected multi_hop got ${multi.mode}`);
  assert.ok(multi.depth >= 2);
  assert.ok(multi.gate.runGraph);
  assert.equal(multi.gate.skipExternalLlmForLookup, false);
  ok('classify entity vs multi_hop gate');
}

// 4. retrieve multi-hop surfaces related docs
{
  const result = retrieve('how does leash relate to thumbgate continuity', {
    repo: fixtureRepo,
    storeRoot,
    graphify: false,
    limit: 8,
  });
  assert.ok(result.matches.length >= 1, 'has matches');
  const paths = result.matches.map((m) => m.path).join(' ');
  assert.ok(
    /leash|continuity|thumbgate/i.test(paths) || result.graphNodes.length > 0,
    `expected related paths, got ${paths}`,
  );
  assert.equal(result.classification.mode, 'multi_hop');
  ok('retrieve multi-hop returns graph-backed matches');
}

// 5. BFS neighbors
{
  const index = loadIndex(fixtureRepo, storeRoot);
  const seeds = matchEntities('thumbgate', index, 3).map((e) => e.id);
  assert.ok(seeds.length >= 1, 'seed thumbgate');
  const adj = buildAdjacency(index);
  const visited = bfsNeighbors(seeds, adj, 2, 30);
  assert.ok(visited.size >= 1, 'bfs visits seeds');
  ok('bfs neighbors from entity seed');
}

// 6. empty index shape
{
  const empty = emptyIndex(fixtureRepo);
  assert.equal(empty.version, 1);
  assert.deepEqual(empty.stats.nodes, 0);
  ok('emptyIndex shape');
}

// 7. gate skip-external for pure entity lookup
{
  const index = loadIndex(fixtureRepo, storeRoot);
  const g = classifyQuery('thumbgate', index);
  if (g.mode === 'entity') {
    assert.equal(g.gate.skipExternalLlmForLookup, true);
    assert.equal(g.gate.preferredBackend, 'graph');
  }
  ok('entity gate can skip external LLM for lookup');
}

console.log(`\n${passed} passed (hermes-graph-rag)`);

// cleanup
try {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch {
  // ignore
}

process.exit(0);
