#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'tools/gurobi-harness-gate.js');
const VENV_PY = path.join(os.homedir(), '.hermes/gurobi-venv/bin/python');
const {
  runHarnessGate,
  formatHuman,
  DEFAULT_WORKLOADS,
  DEFAULT_DISPATCH,
  MONTHLY_BUDGET_USD,
} = require(GATE);

function skip(reason) {
  console.log(`test-gurobi-harness-gate: SKIP ${reason}`);
}

function main() {
  assert.ok(fs.existsSync(GATE), 'gate script missing');
  assert.strictEqual(MONTHLY_BUDGET_USD, 10);
  assert.ok(DEFAULT_WORKLOADS.workloads.some((w) => w.id === 'huge' && w.frontier_cost_usd === 12));
  assert.ok(DEFAULT_DISPATCH.tasks.filter((t) => (t.exclusive || []).includes('adb')).length === 2);

  const py = fs.existsSync(VENV_PY) ? VENV_PY : 'python3';
  const importProbe = spawnSync(
    py,
    ['-c', 'import gurobipy; print("ok")'],
    { encoding: 'utf8', timeout: 15_000 },
  );
  if (importProbe.status !== 0 || !/ok/.test(importProbe.stdout || '')) {
    if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
      skip('CI without gurobipy');
      return;
    }
    skip(`gurobipy not importable: ${(importProbe.stderr || importProbe.stdout || '').slice(0, 160)}`);
    return;
  }

  const receipt = runHarnessGate();
  assert.strictEqual(receipt.skipped, false, JSON.stringify(receipt));
  assert.strictEqual(receipt.ok, true, JSON.stringify(receipt));
  assert.strictEqual(receipt.certified_optimal, true);
  assert.strictEqual(receipt.not_plausible_guess, true);
  assert.ok(receipt.allocated_spend_usd <= 10, `spend ${receipt.allocated_spend_usd}`);
  assert.strictEqual(receipt.huge_excluded, true, 'uncapped $12 item must lose');
  assert.strictEqual(receipt.exclusive_adb_ok, true, JSON.stringify(receipt.exclusive_adb_assigned));
  assert.deepStrictEqual(receipt.exclusive_adb_assigned, ['e2e-a']);
  assert.strictEqual(receipt.token_proof.certified_optimal, true);
  assert.strictEqual(receipt.dispatch_proof.certified_optimal, true);
  assert.ok(Number.isFinite(receipt.token_proof.obj_bound));

  const cli = spawnSync(process.execPath, [GATE, '--json'], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 30_000,
  });
  assert.strictEqual(cli.status, 0, cli.stderr || cli.stdout);
  const parsed = JSON.parse(cli.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.certified_optimal, true);

  const human = spawnSync(process.execPath, [GATE, '--session-start'], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 30_000,
  });
  assert.strictEqual(human.status, 0, human.stderr || human.stdout);
  assert.match(human.stdout, /=== Gurobi proof ===/);
  assert.match(human.stdout, /certified=true/);
  assert.match(human.stdout, /not_guess=true/);
  assert.match(formatHuman(receipt), /OPTIMAL/);

  const sessionSrc = fs.readFileSync(path.join(ROOT, 'tools/agent-session-start.js'), 'utf8');
  assert.match(sessionSrc, /gurobi-harness-gate\.js/);
  const loopSrc = fs.readFileSync(path.join(ROOT, 'bin/agent-loop'), 'utf8');
  assert.match(loopSrc, /gurobi-harness-gate\.js/);

  console.log(
    `test-gurobi-harness-gate: PASS spend=$${receipt.allocated_spend_usd} exclusive_adb=${receipt.exclusive_adb_assigned.join(',')} runtime_ms=${receipt.runtime_ms}`,
  );
}

main();
