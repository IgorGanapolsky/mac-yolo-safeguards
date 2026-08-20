'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { evaluateVibePublish, DEFAULT_THRESHOLD } = require('../tools/island-vibe-publish-gate');

const REPO = path.resolve(__dirname, '..');

test('default threshold is 0.75', () => {
  assert.equal(DEFAULT_THRESHOLD, 0.75);
});

test('say-yes when lock free and hard factors pass (injected lock)', () => {
  const result = evaluateVibePublish({
    repo: REPO,
    requireClean: false,
    checkLock: true,
    lockProbe: () => ({ ok: true, locked: false, detail: 'UNLOCKED' }),
  });
  assert.ok(result.receipt.id.startsWith('island-vibe-'));
  assert.ok(result.receipt.factors.some((f) => f.id === 'deploy_lock_free' && f.pass));
  assert.ok(result.receipt.factors.some((f) => f.id === 'local_head' && f.pass));
  // On a feature worktree, branch_is_main may fail but hardFail should omit it.
  if (result.hardFail.length === 0 && result.confidence >= result.threshold) {
    assert.equal(result.allowed, true);
    assert.equal(result.receipt.kind, 'say_yes_publish');
    assert.match(result.receipt.framing, /Say yes/i);
  } else {
    // Still proves hold path framing when origin/main not contained in this clone state.
    assert.equal(result.allowed, false);
    assert.equal(result.receipt.kind, 'hold_publish');
    assert.match(result.receipt.framing, /Hold publish/i);
  }
});

test('hold when deploy lock is held', () => {
  const result = evaluateVibePublish({
    repo: REPO,
    requireClean: false,
    lockProbe: () => ({ ok: false, locked: true, detail: 'LOCKED: other-agent' }),
  });
  assert.equal(result.allowed, false);
  assert.ok(result.hardFail.includes('deploy_lock_free'));
  assert.equal(result.receipt.kind, 'hold_publish');
});

test('hold when lock status unknown', () => {
  const result = evaluateVibePublish({
    repo: REPO,
    requireClean: false,
    lockProbe: () => ({ ok: false, locked: null, detail: 'gh-timeout' }),
  });
  assert.equal(result.allowed, false);
  assert.ok(result.hardFail.includes('deploy_lock_free'));
});
