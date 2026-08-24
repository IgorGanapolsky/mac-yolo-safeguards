'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SUPPORTED_HARNESSES,
  resolveHarness,
  createHarnessEnvelope,
} = require('../tools/hermes-universal-harness-adapter');

test('SUPPORTED_HARNESSES includes grok and hermes-yolo', () => {
  assert.ok(SUPPORTED_HARNESSES.GROK);
  assert.ok(SUPPORTED_HARNESSES.HERMES_YOLO);
  assert.ok(SUPPORTED_HARNESSES.CURSOR);
  assert.ok(SUPPORTED_HARNESSES.CLAUDE_CODE);
});

test('resolveHarness matches cursor / claude-code / grok', () => {
  assert.equal(resolveHarness('cursor').id, 'cursor');
  assert.equal(resolveHarness('Claude Code').id, 'claude-code');
  assert.equal(resolveHarness('grok').id, 'grok');
  assert.equal(resolveHarness('hermes-yolo').id, 'hermes-yolo');
});

test('unknown harness defaults to grok (not antigravity cloud)', () => {
  const resolved = resolveHarness('totally-unknown-harness');
  assert.equal(resolved.id, 'grok');
  assert.equal(resolved.fallbackReason, 'unknown_harness_defaulted_to_grok');
});

test('createHarnessEnvelope binds harness + task', () => {
  const harness = resolveHarness('codex');
  const env = createHarnessEnvelope({ prompt: 'ship tests', id: 't1' }, harness);
  assert.equal(env.harness, 'codex');
  assert.equal(env.task.prompt, 'ship tests');
  assert.ok(env.id.startsWith('env_'));
});
