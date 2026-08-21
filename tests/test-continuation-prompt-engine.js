#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeContinuationPrompt,
  resolveContinuationPrompt,
} = require('../tools/continuation-prompt-engine.js');

test('normalizes only the compact continuation-command surface', () => {
  assert.equal(normalizeContinuationPrompt('  Keep   going!  '), 'keep going');
  assert.equal(normalizeContinuationPrompt('SHOW RECEIPTS?'), 'show receipts');
});

test('expands an exact command only when prior context exists', () => {
  const resolved = resolveContinuationPrompt('now what', { hasContext: true });
  assert.equal(resolved.applied, true);
  assert.equal(resolved.command, 'now_what');
  assert.equal(resolved.displayPrompt, 'now what');
  assert.match(resolved.executionPrompt, /3 to 5 actionable next steps/i);
  assert.match(resolved.executionPrompt, /established conversation context/i);
});

test('fails open to the raw prompt when context is absent', () => {
  const resolved = resolveContinuationPrompt('show receipts', { hasContext: false });
  assert.equal(resolved.applied, false);
  assert.equal(resolved.reason, 'context_required');
  assert.equal(resolved.executionPrompt, 'show receipts');
  assert.equal(resolved.command, 'show_receipts');
});

test('never hijacks a longer natural-language request', () => {
  const raw = 'now what should we implement for the customer?';
  const resolved = resolveContinuationPrompt(raw, { hasContext: true });
  assert.equal(resolved.applied, false);
  assert.equal(resolved.reason, 'not_continuation_command');
  assert.equal(resolved.executionPrompt, raw);
  assert.equal(resolved.command, null);
});

test('supports the public command aliases without inventing the missing list', () => {
  const cases = new Map([
    ['interview me', 'interview_me'],
    ['plz fix', 'please_fix'],
    ['do this', 'do_this'],
    ['simulate it', 'simulate_it'],
    ['challenge me', 'challenge'],
    ['challenge this', 'challenge'],
    ['keep going!', 'keep_going'],
    ['show receipts', 'show_receipts'],
    ['elii', 'explain_intern'],
    ['elie', 'explain_executive'],
  ]);
  for (const [prompt, command] of cases) {
    assert.equal(resolveContinuationPrompt(prompt, { hasContext: true }).command, command, prompt);
  }
});

test('adapts Bot Mode reset commands into same-thread compaction', () => {
  for (const prompt of ['/new', '/reset']) {
    const resolved = resolveContinuationPrompt(prompt, { hasContext: true });
    assert.equal(resolved.command, 'compact_same_thread');
    assert.match(resolved.executionPrompt, /same persistent conversation/i);
    assert.match(resolved.executionPrompt, /Do not fork/i);
  }
});
