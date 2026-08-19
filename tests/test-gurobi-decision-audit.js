#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/gurobi-decision-audit.js');
const GATE = path.join(ROOT, 'tools/gurobi-harness-gate.js');
const { classify, decorate, record, fingerprint } = require(TOOL);

function main() {
  assert.ok(fs.existsSync(TOOL));
  assert.match(fs.readFileSync(GATE, 'utf8'), /gurobi-decision-audit/);

  const observe = classify({
    certified_optimal: true,
    allocated_spend_usd: 7,
    exclusive_adb_assigned: ['e2e-a'],
    action_class: 'observe',
  });
  assert.strictEqual(observe.observe_allowed, true);
  assert.strictEqual(observe.action_allowed, false, 'certified ADB is not execute');
  assert.strictEqual(observe.execute_adb, false);
  assert.strictEqual(observe.reason, 'certified_allocation_is_not_execute_license');
  assert.strictEqual(observe.oversight, 'human_receipt');

  const mutate = classify({
    certified_optimal: true,
    action_class: 'mutate',
    exclusive_adb_assigned: ['e2e-a'],
  });
  assert.strictEqual(mutate.action_allowed, false);
  const mutateHuman = classify({
    certified_optimal: true,
    action_class: 'mutate',
    exclusive_adb_assigned: ['e2e-a'],
    human_ok: true,
  });
  assert.strictEqual(mutateHuman.action_allowed, true);

  const send = classify({ certified_optimal: true, action_class: 'send' });
  assert.strictEqual(send.action_allowed, false);
  assert.strictEqual(send.reason, 'send_never_from_solver');

  const unproven = classify({ certified_optimal: false, action_class: 'observe' });
  assert.strictEqual(unproven.observe_allowed, false);
  assert.strictEqual(unproven.action_allowed, false);
  assert.strictEqual(unproven.reason, 'not_certified');

  const iis = classify({ is_infeasible: true, action_class: 'observe' });
  assert.strictEqual(iis.observe_allowed, true);
  assert.strictEqual(iis.action_allowed, false);

  const a = { certified_optimal: true, allocated_spend_usd: 7, exclusive_adb_assigned: ['e2e-a'] };
  assert.strictEqual(fingerprint(a), fingerprint({ ...a }));
  assert.notStrictEqual(fingerprint(a), fingerprint({ ...a, allocated_spend_usd: 9 }));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gurobi-audit-'));
  const auditFile = path.join(dir, 'audit.jsonl');
  process.env.GUROBI_AUDIT_PATH = auditFile;
  record({ certified_optimal: true, allocated_spend_usd: 7, exclusive_adb_assigned: ['e2e-a'] });
  record({ certified_optimal: false });
  const lines = fs.readFileSync(auditFile, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2, 'append-only grows');
  const first = JSON.parse(lines[0]);
  assert.strictEqual(first.action_allowed, false);
  assert.strictEqual(first.observe_allowed, true);

  const cli = spawnSync(process.execPath, [TOOL, '--json'], {
    encoding: 'utf8',
    cwd: ROOT,
    input: JSON.stringify({ certified_optimal: true, exclusive_adb_assigned: ['e2e-a'] }),
    timeout: 5_000,
  });
  assert.strictEqual(cli.status, 0, cli.stderr || cli.stdout);
  const parsed = JSON.parse(cli.stdout);
  assert.strictEqual(parsed.governance.action_allowed, false);
  assert.ok(decorate({ skipped: true }).governance.layer === 'skip');

  console.log(
    `test-gurobi-decision-audit: PASS observe=${observe.observe_allowed} action=${observe.action_allowed} fp=${observe.fingerprint} audit_lines=${lines.length}`,
  );
}

main();
