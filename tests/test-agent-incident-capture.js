#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildCapture, redact } = require('../tools/agent-incident-capture');

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

test('redact strips setup deep links and bearer tokens', () => {
  const s = redact('see hermes://setup?pairCode=ABC and Bearer abcdefghijklmnop');
  assert.ok(!/pairCode=ABC/.test(s));
  assert.ok(!/Bearer abcdef/.test(s));
  assert.match(s, /\[redacted\]/);
});

test('buildCapture requires fields', () => {
  const r = buildCapture({ title: 'x' });
  assert.strictEqual(r.ok, false);
});

test('buildCapture emits MCP payload', () => {
  const r = buildCapture({
    title: 'e2e skipped treated as pass',
    rootCause: 'agent equated skipped with green',
    fix: 'hermes-observability-gate refuses ship on skipped',
    artifacts: ['latest.json e2e=skipped', 'tools/hermes-observability-gate.js'],
    signal: 'down',
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mcp.tool, 'capture_memory_feedback');
  assert.strictEqual(r.mcp.signal, 'down');
  assert.match(r.mcp.context, /Root cause:/);
  assert.match(r.mcp.context, /Fix:/);
});

if (process.exitCode) {
  console.error('\nagent-incident-capture tests FAILED');
  process.exit(1);
}
console.log('\nagent-incident-capture tests OK');
