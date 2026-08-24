#!/usr/bin/env node
'use strict';

/**
 * End-to-end tests for examples/gurobi/*.json model files.
 * Verifies each example produces a correct Gurobi solution via the CLI.
 * Does NOT modify tools/gurobi-fleet-optimize.py or gurobi_fleet_lib.py
 * (those are owned by grok-gurobi-pulse-proof-20260819).
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENV_PY = path.join(os.homedir(), '.hermes/gurobi-venv/bin/python');
const PY = fs.existsSync(VENV_PY) ? VENV_PY : 'python3';
const CLI = path.join(ROOT, 'tools/gurobi-fleet-optimize.py');
const EXAMPLES = path.join(ROOT, 'examples', 'gurobi');

function runCli(args) {
  return spawnSync(PY, [CLI, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, PYTHONPATH: path.join(ROOT, 'tools') },
    timeout: 60000,
  });
}

function main() {
  // Skip gracefully on CI without gurobipy
  const lic = runCli(['license', '--json']);
  if (lic.status !== 0) {
    if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
      console.log('test-gurobi-examples: SKIP (CI without gurobipy venv)');
      return;
    }
    assert.fail(`license probe failed: ${(lic.stderr || lic.stdout || '').toString().slice(0, 200)}`);
  }
  const licJson = JSON.parse(lic.stdout);
  if (!licJson.gurobipy_import_ok) {
    if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
      console.log('test-gurobi-examples: SKIP (gurobipy not importable on CI)');
      return;
    }
    assert.fail('gurobipy not importable');
  }

  const cases = [
    // [filename, command, assertion]
    ['lp-model.json', 'solve', (j) => {
      assert.strictEqual(j.ok, true);
      assert.strictEqual(j.status, 'OPTIMAL');
      assert.ok(Math.abs((j.objective || 0) - 2.0) < 1e-6);
      assert.strictEqual(j.proof.certified_optimal, true);
    }],
    ['dispatch-jobs.json', 'dispatch', (j) => {
      assert.strictEqual(j.ok, true);
      assert.ok((j.objective || 0) >= 14);
      assert.strictEqual(j.proof.certified_optimal, true);
    }],
    ['outreach-prospects.json', 'outreach', (j) => {
      assert.strictEqual(j.ok, true);
      const stats = j.model_stats || {};
      assert.ok(stats.selected_count >= 2);
      assert.ok(stats.selected_count <= 5); // capacity=5
    }],
    ['infeasible-model.json', 'iis', (j) => {
      assert.strictEqual(j.ok, true);
      assert.strictEqual(j.is_infeasible, true);
      assert.ok((j.iis_constraints || []).length > 0);
    }],
    ['token-budget-workloads.json', 'token-budget', (j) => {
      assert.strictEqual(j.ok, true);
      assert.ok(j.model_stats.allocated_spend_usd <= 10.0);
      assert.strictEqual(j.model_stats.budget_ceiling_usd, 10.0);
      assert.strictEqual(j.proof.certified_optimal, true);
    }],
  ];

  let passed = 0;
  for (const [filename, cmd, assertFn] of cases) {
    const filePath = path.join(EXAMPLES, filename);
    if (!fs.existsSync(filePath)) {
      assert.fail(`example file missing: ${filename}`);
    }
    const r = runCli([cmd, '--file', filePath, '--json']);
    assert.strictEqual(r.status, 0, `${filename}: ${r.stderr || r.stdout}`);
    const j = JSON.parse(r.stdout);
    assertFn(j);
    passed++;
  }

  console.log(`test-gurobi-examples: PASS (${passed}/${cases.length} example files verified)`);
}

main();
