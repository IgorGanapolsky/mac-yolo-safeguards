#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  SCHEMA,
  T_HIGH,
  ablateResolution,
  asOf,
  ingestEdge,
  jaccard,
  loadFixture,
  resolveMention,
  timeline,
  DEFAULT_FIXTURE,
} = require('../tools/knowledge-layer-edges');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'knowledge-layer-edges.js');
const fixture = loadFixture(DEFAULT_FIXTURE);
const hosted = fixture.canonicals.find((e) => e.id === 'hosted-vps');

console.log('=== test-knowledge-layer-edges ===');

assert.ok(jaccard('fenced VPS', 'fenced VPS') === 1);
assert.ok(jaccard('fenced VPS', 'hosted Hermes') < T_HIGH);

const auto = resolveMention({ text: 'fenced VPS' }, fixture.canonicals);
assert.equal(auto.action, 'same_as');
assert.equal(auto.entityId, 'hosted-vps');
assert.equal(auto.paidLlm, false);

const created = resolveMention({ text: 'laptop chat session' }, fixture.canonicals);
assert.equal(created.action, 'create');
assert.match(created.entityId, /^prov-/);

const gray = resolveMention({ text: 'hosted machine vps' }, fixture.canonicals);
assert.equal(gray.action, 'needs_review');
assert.equal(gray.auto, false);
assert.equal(gray.paidLlm, false);

const ablation = ablateResolution(fixture);
assert.equal(ablation.schema, SCHEMA);
assert.equal(ablation.clonedGremlin, false);
assert.equal(ablation.paidLlm, false);
assert.equal(ablation.improved, true);
assert.ok(
  ablation.aliasOnly.uniqueEntities > ablation.twoThreshold.uniqueEntities,
  `alias ${ablation.aliasOnly.uniqueEntities} vs two ${ablation.twoThreshold.uniqueEntities}`,
);

const store = { edges: [], contradictions: [] };
const first = ingestEdge(store, {
  id: 'e1',
  subject: 'hosted-runtime',
  predicate: 'default_is',
  object: 'hosted-vps',
  validFrom: '2026-07-14',
  source: 'chief-lock',
  authority: 'chief',
});
assert.equal(first.action, 'open');

const supersede = ingestEdge(store, {
  id: 'e2',
  subject: 'hosted-runtime',
  predicate: 'default_is',
  object: 'hosted-vps-v2',
  validFrom: '2026-08-24',
  source: 'chief-lock-2',
  authority: 'chief',
});
assert.equal(supersede.action, 'supersede');
assert.equal(store.edges.find((e) => e.id === 'e1').expired, true);
assert.equal(store.edges.find((e) => e.id === 'e1').validTo, '2026-08-24');
assert.deepEqual(asOf(store, '2026-07-20').map((e) => e.id), ['e1']);
assert.deepEqual(asOf(store, '2026-08-24').map((e) => e.id), ['e2']);
assert.equal(timeline(store, 'hosted-runtime').length, 2);

const conflict = ingestEdge(store, {
  id: 'e3',
  subject: 'hosted-runtime',
  predicate: 'default_is',
  object: 'laptop-pair',
  validFrom: '2026-08-24',
  source: 'old-landing',
  authority: 'legacy-copy',
});
assert.equal(conflict.action, 'contradiction');
assert.equal(conflict.declinesToSettle, true);
assert.equal(store.contradictions[0].status, 'unresolved');
assert.equal(store.edges.find((e) => e.id === 'e2').expired, false);

const cli = spawnSync(process.execPath, [TOOL, '--ablate', '--json'], { encoding: 'utf8', cwd: ROOT });
assert.equal(cli.status, 0, cli.stderr);
const out = JSON.parse(cli.stdout);
assert.equal(out.improved, true);
assert.equal(out.clonedGremlin, false);

console.log('PASS');
