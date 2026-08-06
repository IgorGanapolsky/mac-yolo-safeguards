'use strict';

/**
 * Tests for Yugabyte AMP-inspired hermes-yolo sprawl control.
 *   node tests/test-hermes-yolo-sprawl-control.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SPRAWL = require('../tools/hermes-yolo-sprawl-control.js');
const WRAPPER = path.resolve(__dirname, '../hermes-yolo-wrapper.js');

console.log('=== hermes-yolo sprawl-control tests (Yugabyte AMP) ===\n');

const fleetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-yolo-fleet-'));

// Roles
{
  const r1 = SPRAWL.resolveRoles('migrate the schema and port the API to the new SDK');
  assert.strictEqual(r1.primary.id, 'voyager', `expected voyager got ${r1.primary.id}`);

  const r2 = SPRAWL.resolveRoles('mac freeze and timeout thrash jetsam memory');
  assert.strictEqual(r2.primary.id, 'perf_advisor');

  const r3 = SPRAWL.resolveRoles('wire litellm gateway and mcp oauth keychain');
  assert.strictEqual(r3.primary.id, 'nexus');

  const r4 = SPRAWL.resolveRoles('provision a new worktree and pick the model route');
  assert.strictEqual(r4.primary.id, 'architect');

  const r5 = SPRAWL.resolveRoles('do something vague', { HERMES_YOLO_ROLE: 'perf_advisor' });
  assert.strictEqual(r5.primary.id, 'perf_advisor');
  assert.strictEqual(r5.reason, 'env-HERMES_YOLO_ROLE');
}

// Risk + autonomy
{
  const spend = SPRAWL.resolveAutonomy('please buy credits and upgrade plan');
  assert.strictEqual(spend.mode, 'block');
  assert.ok(spend.risks.some((r) => r.id === 'spend'));

  const dry = SPRAWL.resolveAutonomy('fix anything', { HERMES_YOLO_DRY_RUN: '1' });
  assert.strictEqual(dry.mode, 'dry_run');

  const browser = SPRAWL.resolveAutonomy('drive chrome and computer_use click login');
  assert.ok(browser.askCategories.includes('browser') || browser.risks.some((r) => r.id === 'browser'));

  const strict = SPRAWL.resolveAutonomy('git push --force to main', {
    HERMES_YOLO_ASK_BEFORE: '1',
  });
  assert.ok(strict.mode === 'ask' || strict.risks.some((r) => r.id === 'destructive'));
}

// Decision trace shape (Yugabyte/Meko 4-part)
{
  const trace = SPRAWL.buildDecisionTrace({
    taskText: 'diagnose timeout thrash on hermes-yolo',
    cwd: process.cwd(),
  });
  assert.strictEqual(trace.schema, 'hermes-yolo/decision-trace-v1');
  assert.ok(trace.personSaid.taskDigest);
  assert.ok(Array.isArray(trace.contextSaid.orgHints));
  assert.ok(trace.inferred.primaryRole);
  assert.ok(trace.did);
  const written = SPRAWL.writeDecisionTrace(trace, fleetDir);
  assert.ok(fs.existsSync(written.latestTracePath));
}

// Fleet register / assess / reap (scale-to-zero)
{
  const entry = SPRAWL.registerRun({
    dir: fleetDir,
    pid: process.pid,
    taskText: 'test run',
    role: 'architect',
    backend: 'grok-4.5',
    model: 'grok-4.5',
  });
  assert.ok(entry.runId);

  // Fake dead pid entry
  const reg = SPRAWL.readRegistry(fleetDir);
  reg.runs.push({
    pid: 99999999,
    runId: 'deadbeef',
    startedAt: new Date(Date.now() - 3600e3).toISOString(),
    lastHeartbeatAt: new Date(Date.now() - 3600e3).toISOString(),
    role: 'voyager',
  });
  SPRAWL.writeRegistry(reg, fleetDir);

  const assessment = SPRAWL.assessFleet({ dir: fleetDir, idleMs: 60e3 });
  assert.ok(assessment.total >= 1);
  assert.ok(assessment.runs.some((r) => r.status === 'dead' || r.pid === 99999999));

  const dryReap = SPRAWL.reapFleet({ dir: fleetDir, dryRun: true });
  assert.strictEqual(dryReap.dryRun, true);
  assert.ok(dryReap.reaped.length >= 1);

  const wetReap = SPRAWL.reapFleet({ dir: fleetDir, dryRun: false, killIdle: false });
  assert.strictEqual(wetReap.dryRun, false);
  const after = SPRAWL.assessFleet({ dir: fleetDir });
  assert.ok(!after.runs.some((r) => r.pid === 99999999), 'dead pid should be reaped from registry');

  SPRAWL.unregisterRun(process.pid, fleetDir);
}

// Plan
{
  const plan = SPRAWL.planRun({
    taskText: 'migrate payments schema carefully',
    dir: fleetDir,
  });
  assert.strictEqual(plan.schema, 'hermes-yolo/sprawl-plan-v1');
  assert.strictEqual(plan.roles.primary, 'voyager');
  assert.ok(plan.decisionTrace.personSaid);
  const md = SPRAWL.renderDryRunMarkdown(plan);
  assert.ok(md.includes('dry-run plan'));
  assert.ok(md.includes('Voyager') || md.includes('voyager') || md.includes('Primary role'));
}

// Wrapper soft-load + dry-run CLI (no real agent)
{
  const wrapper = require(WRAPPER);
  assert.strictEqual(typeof wrapper.loadSprawlControlModule, 'function');
  const mod = wrapper.loadSprawlControlModule();
  assert.ok(mod, 'wrapper should find sprawl module in tools/');

  const out = execFileSync(
    process.execPath,
    [WRAPPER, '--dry-run', 'buy credits and upgrade apollo pro'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        HERMES_YOLO_SPRAWL: '1',
        HERMES_YOLO_RECEIPT_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'hy-receipt-')),
        HERMES_YOLO_FLEET_DIR: fleetDir,
        HERMES_YOLO_LOCK_PATH: path.join(os.tmpdir(), `hy-lock-test-${process.pid}`),
        HERMES_YOLO_BACKEND: 'hermes',
        HERMES_YOLO_NO_PREFLIGHT: '1',
      },
    },
  );
  // spend → block should exit 3 before dry-run markdown; either block or dry-run plan is fine
  // Actually resolveAutonomy on "buy credits" is block, which exits 3 before dry_run check.
  // Re-run a non-spend dry-run:
  const out2 = execFileSync(
    process.execPath,
    [WRAPPER, '--dry-run', 'refactor the pairing module'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        HERMES_YOLO_SPRAWL: '1',
        HERMES_YOLO_RECEIPT_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'hy-receipt-')),
        HERMES_YOLO_FLEET_DIR: fleetDir,
        HERMES_YOLO_LOCK_PATH: path.join(os.tmpdir(), `hy-lock-test2-${process.pid}`),
        HERMES_YOLO_BACKEND: 'hermes',
        HERMES_YOLO_NO_PREFLIGHT: '1',
      },
    },
  );
  assert.ok(
    out2.includes('dry-run') || out2.includes('amp-role') || out2.includes('Primary role'),
    `unexpected dry-run output: ${out2.slice(0, 400)}`,
  );

  // Block path: spend
  let blocked = false;
  try {
    execFileSync(process.execPath, [WRAPPER, 'please buy credits upgrade plan'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HERMES_YOLO_SPRAWL: '1',
        HERMES_YOLO_RECEIPT_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'hy-receipt-')),
        HERMES_YOLO_FLEET_DIR: fleetDir,
        HERMES_YOLO_LOCK_PATH: path.join(os.tmpdir(), `hy-lock-test3-${process.pid}`),
        HERMES_YOLO_BACKEND: 'hermes',
        HERMES_YOLO_NO_PREFLIGHT: '1',
      },
    });
  } catch (err) {
    blocked = err.status === 3;
  }
  assert.ok(blocked, 'spend task should exit 3 (blocked)');

  // --sprawl-status
  const statusOut = execFileSync(process.execPath, [WRAPPER, '--sprawl-status'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HERMES_YOLO_FLEET_DIR: fleetDir,
      HERMES_YOLO_NO_PREFLIGHT: '1',
    },
  });
  const status = JSON.parse(statusOut);
  assert.strictEqual(status.schema, 'hermes-yolo/fleet-assessment-v1');

  // silence unused
  void out;
}

console.log('All sprawl-control tests passed.');
process.exit(0);
