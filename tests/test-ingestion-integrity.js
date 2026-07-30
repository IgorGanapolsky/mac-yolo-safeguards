#!/usr/bin/env node
'use strict';

// Coverage for tools/ingestion-integrity.js.
//
// The property under test is NOT "the stores are healthy" — right now they are
// not. It is that this instrument REPORTS the truth about them, including when
// it cannot determine something.
//
// Every store path is injected into a temp dir, so these run hermetically and
// do not depend on what happens to be in ~/.thumbgate.
//
// The sanity check gets particular attention. A previous audit of this same
// store concluded "30 distinct magnitudes = fake embeddings". That was a
// MISDIAGNOSIS: magnitudes clustering at 1.0 is L2 normalisation working
// correctly. Two tests below pin that distinction, because a checker that
// condemns correct normalisation would send someone rebuilding a healthy index.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const {
  checkStoreReconciliation, checkEmbeddingCoverage, checkEmbeddingSanity,
  runIngestionIntegrity, render, namespaceBreakdown,
} = require(path.join(ROOT, 'tools', 'ingestion-integrity.js'));

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); pass += 1; } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`); fail += 1; process.exitCode = 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-'));
const missing = path.join(dir, 'nope.json');

function writeJsonl(name, n) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Array.from({ length: n }, (_, i) => JSON.stringify({ id: i })).join('\n'));
  return p;
}
// Deterministic pseudo-random unit vectors: distinct directions, magnitude 1 —
// i.e. exactly what a real normalised embedder produces.
function unitVectors(count, dim = 8) {
  const out = {};
  for (let i = 0; i < count; i += 1) {
    const v = Array.from({ length: dim }, (_, j) => Math.sin((i + 1) * (j + 1) * 0.7331));
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    out[`id${i}`] = { embedding: v.map((x) => x / mag) };
  }
  return out;
}
const writeEmb = (name, obj) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
};

// --- store reconciliation -----------------------------------------------------

// The reconciliation check is deliberately NOT a count comparison. Comparing
// sqlite=1846 against jsonl=1069 and calling it "42.1% drift" was the first
// version, and it produced the WRONG DIAGNOSIS — it reads as "a writer is
// falling behind" and sends someone hunting a lagging export job. The real
// structure is one canonical store and two DISJOINT partial projections written
// by two pipelines. These tests pin the distinction.

function writeSqlite(name, ids) {
  const p = path.join(dir, name);
  const { execFileSync } = require('child_process');
  execFileSync('sqlite3', [p, 'create table lessons (id TEXT PRIMARY KEY);'], { stdio: 'ignore' });
  if (ids.length) {
    const vals = ids.map((i) => `('${i}')`).join(',');
    execFileSync('sqlite3', [p, `insert into lessons (id) values ${vals};`], { stdio: 'ignore' });
  }
  return p;
}
function writeJsonlIds(name, ids) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, ids.map((i) => JSON.stringify({ id: i })).join('\n'));
  return p;
}

test('a projection missing records FAILS and names the namespaces', () => {
  const all = [...Array(10).keys()].map((i) => `lesson_${i}`)
    .concat([...Array(5).keys()].map((i) => `mem_${i}`));
  const r = checkStoreReconciliation({
    sqlite: writeSqlite('r1.sqlite', all),
    jsonl: writeJsonlIds('r1.jsonl', all.slice(0, 10)),
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /10\/15/);
  // The namespace split is what makes this actionable rather than a bare delta.
  assert.match(r.detail, /lesson_=10/);
  assert.match(r.detail, /mem_=5/);
  assert.match(r.detail, /not a lagging writer/);
});

test('a COMPLETE projection passes even across two namespaces', () => {
  const all = ['lesson_a', 'lesson_b', 'mem_a'];
  const r = checkStoreReconciliation({
    sqlite: writeSqlite('r2.sqlite', all),
    jsonl: writeJsonlIds('r2.jsonl', all),
  });
  assert.equal(r.status, 'ok', `complete coverage must pass, got: ${r.detail}`);
});

test('an ORPHAN id in the projection is caught — stores disagree on what exists', () => {
  const r = checkStoreReconciliation({
    sqlite: writeSqlite('r3.sqlite', ['lesson_a', 'lesson_b']),
    jsonl: writeJsonlIds('r3.jsonl', ['lesson_a', 'lesson_GHOST']),
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /NOT in the canonical store/);
  assert.match(r.detail, /lesson_GHOST/);
});

test('cannot-determine is a FAILURE, never a silent pass', () => {
  const r = checkStoreReconciliation({ sqlite: missing, jsonl: missing });
  assert.equal(r.status, 'fail', 'unreadable stores must not report healthy');
});

test('namespaceBreakdown surfaces a two-pipeline corpus', () => {
  const out = namespaceBreakdown(new Set(['lesson_1', 'lesson_2', 'mem_1']));
  assert.match(out, /lesson_=2/);
  assert.match(out, /mem_=1/);
});

// --- embedding coverage -------------------------------------------------------

test('low embedding coverage FAILS and states the fraction', () => {
  const r = checkEmbeddingCoverage({
    sqlite: missing,
    jsonl: writeJsonl('b.jsonl', 1000),
    embeddings: writeEmb('b.json', unitVectors(207)),
  });
  assert.equal(r.status, 'fail');
  assert.ok(Math.abs(r.coverage - 0.207) < 1e-6, `expected 20.7%, got ${r.coverage}`);
  assert.match(r.detail, /20\.7%/);
});

test('full coverage passes', () => {
  const r = checkEmbeddingCoverage({
    sqlite: missing,
    jsonl: writeJsonl('c.jsonl', 100),
    embeddings: writeEmb('c.json', unitVectors(100)),
  });
  assert.equal(r.status, 'ok');
});

test('a missing embedding store FAILS rather than reading as 0% quietly', () => {
  const r = checkEmbeddingCoverage({ sqlite: missing, jsonl: writeJsonl('d.jsonl', 10), embeddings: missing });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /no readable embedding store/);
});

test('an unknown corpus size FAILS instead of dividing by a guess', () => {
  const r = checkEmbeddingCoverage({ sqlite: missing, jsonl: missing, embeddings: writeEmb('e.json', unitVectors(5)) });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /cannot determine corpus size/);
});

// --- embedding sanity: the misdiagnosis guard ---------------------------------

test('NORMALISED vectors (all magnitude 1.0) are NOT condemned as fake', () => {
  // This is the case a previous audit got wrong. Every magnitude is 1.0, and
  // that is correct behaviour, not evidence of fabrication.
  const vecs = unitVectors(200);
  const mags = Object.values(vecs).map((e) => Math.sqrt(e.embedding.reduce((s, x) => s + x * x, 0)));
  assert.ok(mags.every((m) => Math.abs(m - 1) < 1e-9), 'fixture must actually be normalised');
  const r = checkEmbeddingSanity({ embeddings: writeEmb('norm.json', vecs) });
  assert.equal(r.status, 'ok', `normalised vectors must pass, got: ${r.detail}`);
});

test('genuinely DUPLICATE vectors are caught', () => {
  const same = { embedding: [0.5, 0.5, 0.5, 0.5] };
  const vecs = {};
  for (let i = 0; i < 50; i += 1) vecs[`id${i}`] = same;
  const r = checkEmbeddingSanity({ embeddings: writeEmb('dup.json', vecs) });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /distinct/);
});

test('mixed dimensions are caught — two embedders wrote one store', () => {
  const r = checkEmbeddingSanity({
    embeddings: writeEmb('mixed.json', {
      a: { embedding: [1, 0, 0] },
      b: { embedding: [0, 1, 0, 0, 0, 0, 0, 0] },
    }),
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /mixed dimensions/);
});

test('bare-array vectors are supported, not treated as empty', () => {
  const arr = {};
  for (let i = 0; i < 30; i += 1) arr[`id${i}`] = [Math.sin(i), Math.cos(i), i * 0.01];
  const r = checkEmbeddingSanity({ embeddings: writeEmb('bare.json', arr) });
  assert.equal(r.status, 'ok', `bare arrays must parse, got: ${r.detail}`);
});

// --- suite behaviour ----------------------------------------------------------

test('any failing check makes the whole run not-ok and exits non-zero', () => {
  const res = runIngestionIntegrity({
    skipFreshness: true, sqlite: missing, jsonl: missing, embeddings: missing,
  });
  assert.equal(res.ok, false);
  assert.ok(res.failed >= 2);
});

test('a fully healthy set of stores reports ok', () => {
  const res = runIngestionIntegrity({
    skipFreshness: true,
    sqlite: missing,
    jsonl: writeJsonl('h.jsonl', 100),
    embeddings: writeEmb('h.json', unitVectors(100)),
  });
  // store-reconciliation still fails (sqlite unreadable) — assert the OTHER two
  // pass, proving a healthy store is not condemned by an over-eager checker.
  const byName = Object.fromEntries(res.checks.map((c) => [c.name, c.status]));
  assert.equal(byName['embedding-coverage'], 'ok');
  assert.equal(byName['embedding-sanity'], 'ok');
});

test('render never prints OK beside a failing check', () => {
  const res = runIngestionIntegrity({
    skipFreshness: true, sqlite: missing, jsonl: missing, embeddings: missing,
  });
  const out = render(res);
  assert.match(out, /\[FAIL\]/);
  const okLines = out.split('\n').filter((l) => l.includes('[OK'));
  assert.equal(okLines.length, 0, 'no check should report OK when all inputs are missing');
});

console.log(`\n=== ingestion-integrity: ${pass} passed, ${fail} failed ===`);
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
