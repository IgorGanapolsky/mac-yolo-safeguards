#!/usr/bin/env node
'use strict';

/**
 * Pins the PR-sweep policy.
 *
 * 2026-08-04: the sweep closed three consecutive PRs carrying verified bug
 * fixes, commenting "Closing superseded conflicting PR." Nothing was ever
 * superseded — they merely had merge conflicts with a fast-moving main. The
 * same version force-merged `mergeable === 'UNKNOWN'` PRs with --admin, which
 * can land a red PR on main because UNKNOWN means "not computed yet".
 *
 * These tests exist so neither behaviour can return silently.
 */

const assert = require('assert');
const { decidePrAction, checkPosture } = require('../tools/force-merge-pr-sweep');

const NOW = Date.parse('2026-08-04T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const ok = (c) => ({ name: c, conclusion: 'SUCCESS' });
const bad = (c) => ({ name: c, conclusion: 'FAILURE' });
const busy = (c) => ({ name: c, state: 'IN_PROGRESS' });

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('PR sweep policy');

test('never merges when mergeability is UNKNOWN', () => {
  const d = decidePrAction(
    { mergeable: 'UNKNOWN', createdAt: daysAgo(1), statusCheckRollup: [ok('ci')] },
    { nowMs: NOW },
  );
  assert.strictEqual(d.action, 'wait', 'UNKNOWN must wait, never merge');
});

test('a fresh conflicting PR is repaired, not closed', () => {
  const d = decidePrAction(
    { mergeable: 'CONFLICTING', createdAt: daysAgo(1), statusCheckRollup: [] },
    { nowMs: NOW },
  );
  assert.strictEqual(d.action, 'repair', 'recent conflicts must be repaired');
  assert.notStrictEqual(d.action, 'close', 'must never close a fresh conflicting PR');
});

test('conflicting PR just under the stale threshold is still not closed', () => {
  const d = decidePrAction(
    { mergeable: 'CONFLICTING', createdAt: daysAgo(13.9), statusCheckRollup: [] },
    { nowMs: NOW },
  );
  assert.strictEqual(d.action, 'repair');
});

test('conflicting PR past the stale threshold is closed', () => {
  const d = decidePrAction(
    { mergeable: 'CONFLICTING', createdAt: daysAgo(20), statusCheckRollup: [] },
    { nowMs: NOW },
  );
  assert.strictEqual(d.action, 'close');
  assert.ok(/unresolved/i.test(d.reason), `reason should explain: ${d.reason}`);
});

test('never merges while a check is failing', () => {
  const d = decidePrAction(
    {
      mergeable: 'MERGEABLE',
      createdAt: daysAgo(1),
      statusCheckRollup: [ok('unit'), bad('iPad gate')],
    },
    { nowMs: NOW },
  );
  assert.strictEqual(d.action, 'skip');
  assert.ok(/iPad gate/.test(d.reason), `should name the failure: ${d.reason}`);
});

test('never merges while a check is still running', () => {
  const d = decidePrAction(
    {
      mergeable: 'MERGEABLE',
      createdAt: daysAgo(1),
      statusCheckRollup: [ok('unit'), busy('Maestro ship-guard')],
    },
    { nowMs: NOW },
  );
  assert.strictEqual(d.action, 'skip');
  assert.ok(/running/i.test(d.reason));
});

test('merges when mergeable and every check is green', () => {
  const d = decidePrAction(
    {
      mergeable: 'MERGEABLE',
      createdAt: daysAgo(1),
      statusCheckRollup: [ok('unit'), ok('iPad gate')],
    },
    { nowMs: NOW },
  );
  assert.strictEqual(d.action, 'merge');
});

test('drafts are left alone', () => {
  const d = decidePrAction(
    { isDraft: true, mergeable: 'MERGEABLE', createdAt: daysAgo(1), statusCheckRollup: [] },
    { nowMs: NOW },
  );
  assert.strictEqual(d.action, 'skip');
});

test('checkPosture treats QUEUED as running, not green', () => {
  const p = checkPosture({ statusCheckRollup: [{ name: 'iPad E2E', state: 'QUEUED' }] });
  assert.strictEqual(p.green, false, 'QUEUED must not count as green');
  assert.deepStrictEqual(p.running, ['iPad E2E']);
});

console.log(`\n${passed} passed`);
if (process.exitCode) {
  console.error('POLICY REGRESSION — the sweep may destroy work again.');
}
