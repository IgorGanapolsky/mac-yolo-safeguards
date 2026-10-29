#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  createFlag,
  withKey,
  addRule,
  enableRule,
  pinIndividualsFirst,
  resolveFlag,
  variantUse,
  archiveFlag,
  listActive,
  staleCandidates,
  recordApply,
  stepRollout,
  fixtureReport,
} = require('../tools/confidence-active-flags-gate');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

function navbar() {
  return createFlag({
    key: 'new-navbar',
    creator: 'igor',
    clients: ['hermes-mobile'],
    schema: [{ name: 'color', type: 'string' }],
    variants: [
      { name: 'control', value: {} },
      { name: 'treatment', value: { color: 'red' } },
    ],
  });
}

check('the active list stays empty until a flag exists', () => {
  assert.deepEqual(listActive(), []);
  assert.deepEqual(listActive(undefined), []);
  const flag = navbar();
  assert.equal(flag.owner, 'igor');
  assert.equal(flag.state, 'ACTIVE');
  assert.equal(listActive([flag, { key: 'old', state: 'ARCHIVED' }]).length, 1);
  assert.throws(() => createFlag({ key: 'new-navbar-enabled', creator: 'igor' }), /key_encodes_config/);
  assert.throws(() => createFlag({ key: 'new-navbar', creator: '' }), /creator_required/);
  assert.throws(() => withKey(flag, 'other-navbar'), /key_immutable/);
  assert.throws(() => createFlag({
    key: 'new-navbar',
    creator: 'igor',
    schema: [{ name: 'color', type: 'string' }],
    variants: [{ name: 'bad', value: { color: 1 } }],
  }), /schema_type/);
});

check('an archived flag and an unlisted client return the caller default', () => {
  let flag = addRule(navbar(), { name: 'everyone', segment: 'all', variant: 'treatment' });
  assert.equal(flag.rules[0].enabled, false);
  assert.equal(flag.rules[0].priority, 1);
  const held = resolveFlag(flag, { client: 'hermes-mobile', entity: 'igor', defaultValue: { color: 'blue' } });
  assert.equal(held.reason, 'no_matching_rule');
  assert.equal(held.variant, null);
  flag = enableRule(flag, 'everyone');
  const matched = resolveFlag(flag, { client: 'hermes-mobile', entity: 'ada', defaultValue: { color: 'blue' } });
  assert.equal(matched.variant, 'treatment');
  assert.equal(matched.value.color, 'red');
  const stranger = resolveFlag(flag, { client: 'web', entity: 'ada', defaultValue: { color: 'blue' } });
  assert.equal(stranger.reason, 'client_not_associated');
  assert.equal(stranger.variant, null);
  assert.equal(archiveFlag(flag).reason, 'enabled_rules_remain');
  const archived = archiveFlag(enableRule(flag, 'everyone', false), '2026-10-29T16:20:00Z');
  assert.equal(archived.ok, true);
  const resolved = resolveFlag(archived.flag, {
    client: 'hermes-mobile',
    entity: 'ada',
    defaultValue: { color: 'blue' },
  });
  assert.equal(resolved.reason, 'flag_archived');
  assert.equal(resolved.variant, null);
  assert.equal(resolved.value.color, 'blue');
  assert.equal(recordApply(archived.flag, resolved, '2026-10-29T16:21:00Z').ok, false);
});

check('the first enabled rule wins and individual rules can be pinned first', () => {
  let flag = navbar();
  flag = addRule(flag, { name: 'everyone', segment: 'all', variant: 'control', priority: 1 });
  flag = addRule(flag, { name: 'employees', entities: ['igor'], variant: 'treatment', priority: 5 });
  flag = enableRule(enableRule(flag, 'everyone'), 'employees');
  const before = resolveFlag(flag, { client: 'hermes-mobile', entity: 'igor', defaultValue: { color: 'blue' } });
  assert.equal(before.rule, 'everyone');
  assert.equal(before.value.color, 'blue');
  const pinned = pinIndividualsFirst(flag);
  const after = resolveFlag(pinned, { client: 'hermes-mobile', entity: 'igor', defaultValue: { color: 'blue' } });
  assert.equal(after.rule, 'employees');
  assert.equal(after.value.color, 'red');
  assert.equal(variantUse(flag, 'treatment'), 'in_use');
  assert.equal(variantUse(flag, 'missing'), 'unused');
  const partial = resolveFlag(pinned, { client: 'hermes-mobile', entity: 'ada', defaultValue: { color: 'blue', size: 1 } });
  assert.equal(partial.variant, 'control');
  assert.equal(partial.value.color, 'blue');
  assert.equal(partial.value.size, 1);
});

check('a flag with no enabled rule or no recent apply is an archive candidate', () => {
  const now = Date.parse('2026-10-29T16:20:00Z');
  const quiet = navbar();
  const fresh = recordApply(
    enableRule(addRule(navbar(), { name: 'everyone', segment: 'all', variant: 'control' }), 'everyone'),
    { assigned: true, reason: 'rule_match' },
    '2026-10-29T15:00:00Z',
  ).flag;
  const names = staleCandidates([quiet, fresh], now, 60 * 60 * 1000).map((flag) => flag.key);
  assert.equal(names.length, 2);
  const recent = recordApply(fresh, { assigned: true }, '2026-10-29T16:10:00Z').flag;
  assert.deepEqual(staleCandidates([recent], now, 60 * 60 * 1000), []);
});

check('a failed guardrail rolls the reach back', () => {
  const failed = stepRollout({ reach: 10, proposedReach: 20, previousReach: 0, guardrailsPass: false });
  assert.equal(failed.reach, 0);
  assert.equal(failed.rolledBack, true);
  const held = stepRollout({ reach: 10, proposedReach: 20, previousReach: 0, guardrailsPass: true });
  assert.equal(held.reach, 20);
  assert.equal(held.reason, 'guardrails_held');
  const flat = stepRollout({ reach: 20, proposedReach: 20, previousReach: 10, guardrailsPass: true });
  assert.equal(flat.reach, 20);
  assert.equal(flat.reason, 'no_increase');
});

check('the fixture report stays fail-closed', () => {
  const report = fixtureReport();
  assert.equal(report.ok, true);
  assert.equal(report.fixtures, true);
  assert.equal(report.emptyCount, 0);
  assert.equal(report.activeCount, 1);
  assert.equal(report.archived.variant, null);
  const run = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/confidence-active-flags-gate.js'),
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const body = JSON.parse(run.stdout);
  assert.equal(body.fixtures, true);
  assert.equal(body.emptyCount, 0);
});

console.log(`confidence-active-flags-gate: ${passed} checks passed`);
