#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { evaluateObservability } = require('../tools/hermes-observability-gate');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const NOW = Date.parse('2026-07-16T14:00:00Z');

test('ship mode fails on e2e=skipped', () => {
  const r = evaluateObservability(
    { e2e: 'skipped', unit: 'pass', updatedAt: '2026-07-16T13:50:00Z' },
    { mode: 'ship', now: NOW },
  );
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.deviceVerified, false);
  assert.ok(r.violations.some((v) => v.code === 'e2e_not_pass'));
});

test('ship mode passes fresh e2e=pass', () => {
  const r = evaluateObservability(
    { e2e: 'pass', unit: 'pass', updatedAt: '2026-07-16T13:50:00Z' },
    { mode: 'ship', now: NOW, maxAgeMin: 120 },
  );
  assert.strictEqual(r.pass, true);
  assert.strictEqual(r.deviceVerified, true);
});

test('ship mode fails stale proof', () => {
  const r = evaluateObservability(
    { e2e: 'pass', unit: 'pass', updatedAt: '2026-07-16T10:00:00Z' },
    { mode: 'ship', now: NOW, maxAgeMin: 60 },
  );
  assert.strictEqual(r.pass, false);
  assert.ok(r.violations.some((v) => v.code === 'proof_stale'));
});

test('status mode tolerates skipped when not fail', () => {
  const r = evaluateObservability(
    { e2e: 'skipped', unit: 'skipped', updatedAt: '2026-07-16T13:50:00Z' },
    { mode: 'status', now: NOW, maxAgeMin: 120 },
  );
  assert.strictEqual(r.pass, true);
});

test('status mode fails on e2e=fail', () => {
  const r = evaluateObservability(
    { e2e: 'fail', unit: 'pass', updatedAt: '2026-07-16T13:50:00Z' },
    { mode: 'status', now: NOW },
  );
  assert.strictEqual(r.pass, false);
});

if (process.exitCode) {
  console.error('\nhermes-observability-gate tests FAILED');
  process.exit(1);
}
console.log('\nhermes-observability-gate tests OK');
