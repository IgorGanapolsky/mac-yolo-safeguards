#!/usr/bin/env node
'use strict';
// test-hermes-mobile-ci-proof-gate.js — unit tests for the durable Hermes Mobile proof gate.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { gate, parseRecord, ageHours } = require('../tools/hermes-mobile-ci-proof-gate.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-proof-gate-test-'));
const P = path.join(TMP, 'latest.json');

function write(rec) { fs.writeFileSync(P, JSON.stringify(rec, null, 2)); }
const NOW = () => new Date().toISOString();
const HOUR = 3600_000;

let pass = 0;
function ok(m) { console.log('  [PASS]', m); pass++; }

async function main() {
  // 1. Missing file -> block.
  let r = gate(P, 168);
  assert.strictEqual(r.pass, false);
  assert.ok(/missing/.test(r.reason));
  ok('gate blocks when product proof file is absent');

  // 2. Empty file -> block.
  fs.writeFileSync(P, '   \n');
  r = gate(P, 168);
  assert.strictEqual(r.pass, false);
  assert.ok(/empty/.test(r.reason));
  ok('gate blocks on empty proof file');

  // 3. Invalid JSON -> block.
  fs.writeFileSync(P, '{ nope');
  r = gate(P, 168);
  assert.strictEqual(r.pass, false);
  assert.ok(/not valid JSON/.test(r.reason));
  ok('gate blocks on malformed JSON');

  // 4. Missing required fields -> block.
  write({ updatedAt: NOW(), e2e: 'pass' });
  r = gate(P, 168);
  assert.strictEqual(r.pass, false);
  assert.ok(/missing fields/.test(r.reason));
  ok('gate blocks on record missing required fields');

  // 5. Stale pass outside freshness window -> block.
  write({ updatedAt: new Date(Date.now() - 30 * 24 * HOUR).toISOString(), unit: 'pass', e2e: 'pass', detail: 'old' });
  r = gate(P, 168);
  assert.strictEqual(r.pass, false);
  assert.ok(/stale/.test(r.reason));
  ok('gate blocks on stale pass');

  // 6. e2e != pass -> block.
  write({ updatedAt: NOW(), unit: 'pass', e2e: 'fail', detail: 'device crash' });
  r = gate(P, 168);
  assert.strictEqual(r.pass, false);
  assert.ok(/not pass/.test(r.reason));
  ok('gate blocks when e2e != pass');

  // 7. unit != pass -> block.
  write({ updatedAt: NOW(), unit: 'fail', e2e: 'pass', detail: 'jest failure' });
  r = gate(P, 168);
  assert.strictEqual(r.pass, false);
  assert.ok(/unit=fail/.test(r.reason));
  ok('gate blocks when unit != pass');

  // 8. Fresh pass inside window -> green.
  write({ updatedAt: NOW(), unit: 'pass', e2e: 'pass', detail: 'all green', flows: ['login', 'pair'] });
  r = gate(P, 168);
  assert.strictEqual(r.pass, true);
  assert.ok(/fresh/.test(r.reason));
  ok('gate passes fresh e2e+unit pass');

  // 9. ageHours parses ISO timestamp and computes sane gradient.
  const now = Date.now();
  const a5 = ageHours(new Date(now - 5 * HOUR).toISOString());
  assert.ok(a5 > 4.9 && a5 < 5.1, '5h record -> ~5h age');
  ok('ageHours computes age from updatedAt');

  console.log('hermes-mobile CI proof gate: %d passed', pass);
  process.exit(pass === 9 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });