#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const fuse = require('../tools/knowledge-graph-fuse');

const REPO = path.resolve(__dirname, '..');
const TOOL = path.join(REPO, 'tools', 'knowledge-graph-fuse.js');
const BIN = path.join(REPO, 'bin', 'knowledge-graph-fuse');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok - ${name}\n`);
}

const graph = {
  nodes: [
    { id: 'tinker', label: 'tinker-yolo', source_file: 'tinker-yolo' },
    { id: 'distill', label: 'prompt_distill()', source_file: 'tools/hermes-yolo-tinker-prompt-distill.js' },
    { id: 'wrapper', label: 'hermes-yolo-wrapper', source_file: 'hermes-yolo-wrapper.js' },
    { id: 'orphan', label: 'unrelated', source_file: 'tools/unrelated.js' },
  ],
  links: [
    { source: 'tinker', target: 'distill', relation: 'calls', source_file: 'tinker-yolo' },
    { source: 'distill', target: 'wrapper', relation: 'imports', source_file: 'tools/hermes-yolo-tinker-prompt-distill.js' },
    { source: 'tinker', target: 'orphan', relation: 'contradicts', source_file: 'tinker-yolo' },
  ],
};

const hits = [{ path: 'tinker-yolo', rank: 1, source: 'search' }];

test('does not route; always fuses a 1-hop neighborhood', () => {
  const report = fuse.buildReport({ hits, graph, hops: 1, ablate: true });
  assert.strictEqual(report.schema, fuse.SCHEMA);
  assert.strictEqual(report.routed, false);
  assert.strictEqual(report.fused, true);
  assert.strictEqual(report.clonedGremlin, false);
  assert.strictEqual(report.paidLlm, false);
  const files = report.matches.map((m) => m.path);
  assert.ok(files.includes('tinker-yolo'));
  assert.ok(files.includes('tools/hermes-yolo-tinker-prompt-distill.js'));
  assert.ok(report.ablation.extraFromGraph.includes('tools/hermes-yolo-tinker-prompt-distill.js'));
  assert.strictEqual(report.ablation.searchOnlyPathCount, 0);
  assert.ok(report.ablation.fusedPathCount >= 1);
});

test('search-only ablation misses the neighbor that fusion walks', () => {
  const report = fuse.buildReport({ hits, graph, hops: 1, ablate: true });
  assert.strictEqual(report.ablation.searchOnlyFileCount, 1);
  assert.ok(report.ablation.fusedFileCount > report.ablation.searchOnlyFileCount);
  assert.ok(!report.ablation.extraFromGraph.includes('tinker-yolo'));
});

test('two hops reach the wrapper; one hop does not', () => {
  const one = fuse.buildReport({ hits, graph, hops: 1 });
  const two = fuse.buildReport({ hits, graph, hops: 2 });
  const oneFiles = one.matches.map((m) => m.path);
  const twoFiles = two.matches.map((m) => m.path);
  assert.ok(!oneFiles.includes('hermes-yolo-wrapper.js'));
  assert.ok(twoFiles.includes('hermes-yolo-wrapper.js'));
});

test('search hits carry entity anchors into the graph', () => {
  const report = fuse.buildReport({ hits, graph, hops: 1 });
  assert.deepStrictEqual(report.anchors[0].entityIds, ['tinker']);
});

test('contradiction gate declines to settle', () => {
  const report = fuse.buildReport({ hits, graph, hops: 1 });
  assert.strictEqual(report.declinesToSettle, true);
  assert.ok(report.contradictions.some((c) => c.relation === 'contradicts'));
});

test('as-of is a filter, not a third engine, and is honest on graphify AST', () => {
  const report = fuse.buildReport({ hits, graph, hops: 1, asOf: '2026-03-01' });
  assert.strictEqual(report.time.isFilter, true);
  assert.strictEqual(report.time.applied, false);
  assert.strictEqual(report.time.reason, 'graphify-ast-edges-have-no-validity-window');
});

test('missing graph degrades to search hits instead of routing', () => {
  const report = fuse.buildReport({ hits, graph: null, hops: 1, ablate: true });
  assert.strictEqual(report.graphAvailable, false);
  assert.strictEqual(report.fused, true);
  assert.strictEqual(report.routed, false);
  assert.deepStrictEqual(report.matches.map((m) => m.path), ['tinker-yolo']);
});

test('CLI --json and --ablate never dump node bodies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kgf-'));
  const gPath = path.join(root, 'graph.json');
  const hPath = path.join(root, 'hits.json');
  fs.writeFileSync(gPath, JSON.stringify(graph));
  fs.writeFileSync(hPath, JSON.stringify(hits));
  const proc = spawnSync(process.execPath, [
    TOOL, '--hits-file', hPath, '--graph', gPath, '--ablate', '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(proc.status, 0, proc.stderr);
  const payload = JSON.parse(proc.stdout);
  assert.strictEqual(payload.routed, false);
  assert.ok(payload.ablation.extraFromGraphCount >= 1);
  assert.strictEqual(JSON.stringify(payload).includes('unrelated secret'), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('bin wrapper points at the tool', () => {
  assert.match(fs.readFileSync(BIN, 'utf8'), /knowledge-graph-fuse/);
});

process.stdout.write(`PASS ${passed}/9 knowledge-graph-fuse\n`);
