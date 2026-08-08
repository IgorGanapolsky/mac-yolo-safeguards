#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  checkAccess,
  accessMatrix,
  ROLES,
  TOOLS,
} = require('../tools/hermes-mcp-admin-access');

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

test('roles and tools defined', () => {
  assert.ok(ROLES.reader && ROLES.operator && ROLES.admin);
  assert.ok(TOOLS['fleet.status']);
  assert.ok(TOOLS['spend.authorize'].hardDeny);
});

test('reader can status, cannot reap', () => {
  assert.strictEqual(checkAccess('reader', 'fleet.status').allowed, true);
  assert.strictEqual(checkAccess('reader', 'fleet.reap').allowed, false);
  assert.strictEqual(checkAccess('reader', 'fleet.reap').reason, 'role_too_low');
});

test('operator can dry-run and skill eval, not production mutate', () => {
  assert.strictEqual(checkAccess('operator', 'fleet.reap_dry_run').allowed, true);
  assert.strictEqual(checkAccess('operator', 'skill.eval').allowed, true);
  const prod = checkAccess('operator', 'auth.production_mutate', { allowProduction: true });
  assert.strictEqual(prod.allowed, false);
  assert.strictEqual(prod.reason, 'role_too_low');
});

test('admin production mutate still locked without allow flag', () => {
  const locked = checkAccess('admin', 'auth.production_mutate');
  assert.strictEqual(locked.allowed, false);
  assert.strictEqual(locked.reason, 'production_locked');
  const open = checkAccess('admin', 'auth.production_mutate', { allowProduction: true });
  assert.strictEqual(open.allowed, true);
});

test('spend.authorize always hard-deny even for admin+prod', () => {
  const r = checkAccess('admin', 'spend.authorize', { allowProduction: true });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, 'hard_deny_never_spend');
});

test('unknown tool denied', () => {
  const r = checkAccess('admin', 'no.such.tool');
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, 'unknown_tool');
});

test('matrix is consistent with checkAccess', () => {
  const { matrix } = accessMatrix({ allowProduction: true });
  for (const [tool, roles] of Object.entries(matrix)) {
    for (const [role, allowed] of Object.entries(roles)) {
      assert.strictEqual(
        checkAccess(role, tool, { allowProduction: true }).allowed,
        allowed,
        `${role} ${tool}`,
      );
    }
  }
});

if (process.exitCode) process.exit(process.exitCode);
console.log('All test-hermes-mcp-admin-access tests passed.');
