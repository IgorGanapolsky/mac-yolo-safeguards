#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  scoreEvents,
  scoreFromRedeemResults,
  THRESHOLDS,
} = require('../tools/hermes-abuse-radar');
const { createKnownStateStore } = require('../tools/hermes-known-state-emulate');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err.stack || err.message);
    process.exitCode = 1;
  }
}

test('benign successes stay allow', () => {
  const r = scoreEvents([
    { ok: true, deviceId: 'phone1' },
    { ok: true, deviceId: 'phone1' },
  ]);
  assert.strictEqual(r.action, 'allow');
  assert.ok(r.score < THRESHOLDS.allow);
});

test('invalid code burst blocks', () => {
  const events = Array.from({ length: 12 }, (_, i) => ({
    ok: false,
    error: 'invalid_grant',
    deviceId: `d${i % 5}`,
    ip: `10.0.0.${i % 4}`,
    at: Date.now() - i * 200,
  }));
  const r = scoreEvents(events);
  assert.ok(r.score >= THRESHOLDS.challenge, `score=${r.score}`);
  assert.strictEqual(r.action, 'block');
  assert.ok(r.reasons.includes('invalid_code'));
});

test('scoreFromRedeemResults wires emulate failures', () => {
  const store = createKnownStateStore();
  const results = [];
  for (let i = 0; i < 10; i += 1) {
    results.push(store.redeemPairCode('WRONGCODE'));
  }
  const r = scoreFromRedeemResults(results);
  assert.ok(r.score > 0);
  assert.ok(['challenge', 'block'].includes(r.action));
});

test('empty events allow', () => {
  const r = scoreEvents([]);
  assert.strictEqual(r.action, 'allow');
  assert.strictEqual(r.score, 0);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('All test-hermes-abuse-radar tests passed.');
