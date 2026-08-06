#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildBaselines, flagAnomalies, runDemo } = require('../tools/hermes-agent-identity-analytics');

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

test('empty baselines ok', () => {
  const b = buildBaselines({
    aamLog: '/tmp/does-not-exist-aam.jsonl',
    wgLog: '/tmp/does-not-exist-wg.jsonl',
  });
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.totals.agents, 0);
});

test('flagAnomalies detects write burst and critical attempts', () => {
  const baselines = {
    byAgent: {
      rogue: {
        id: 'rogue',
        events: 30,
        allows: 25,
        denials: 5,
        blocked: 3,
        criticalAttempts: 3,
        writes: 25,
        tools: {},
      },
      quiet: {
        id: 'quiet',
        events: 2,
        allows: 2,
        denials: 0,
        blocked: 0,
        criticalAttempts: 0,
        writes: 0,
        tools: {},
      },
    },
  };
  const flags = flagAnomalies(baselines);
  assert.strictEqual(flags.ok, true);
  assert.strictEqual(flags.alert, true);
  assert.ok(flags.flags.some((f) => f.kind === 'write_burst'));
  assert.ok(flags.flags.some((f) => f.kind === 'critical_tool_attempt'));
});

test('demo joe cleanup agent story', () => {
  const demo = runDemo();
  assert.strictEqual(demo.ok, true, JSON.stringify(demo.anomalies, null, 2));
  assert.ok(demo.anomalies.flags.length >= 2);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('test-hermes-agent-identity-analytics: ok');
