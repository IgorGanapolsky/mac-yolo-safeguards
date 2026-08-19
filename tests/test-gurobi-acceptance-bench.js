#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BENCH = path.join(ROOT, 'tools/gurobi-acceptance-bench.js');
const VENV_PY = path.join(os.homedir(), '.hermes/gurobi-venv/bin/python');
const { runAcceptanceBench, GOLD } = require(BENCH);

function skip(reason) {
  console.log(`test-gurobi-acceptance-bench: SKIP ${reason}`);
}

function main() {
  assert.ok(fs.existsSync(BENCH));
  assert.ok(GOLD['lp-model.json'].objective === 2.0);
  assert.ok(fs.existsSync(path.join(ROOT, 'examples/gurobi/lp-model.json')));

  const py = fs.existsSync(VENV_PY) ? VENV_PY : 'python3';
  const probe = spawnSync(py, ['-c', 'import gurobipy; print("ok")'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (probe.status !== 0 || !/ok/.test(probe.stdout || '')) {
    if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
      skip('CI without gurobipy');
      return;
    }
    skip(`gurobipy not importable: ${(probe.stderr || probe.stdout || '').slice(0, 160)}`);
    return;
  }

  const receipt = runAcceptanceBench({ repeats: 3 });
  assert.strictEqual(receipt.skipped, false, JSON.stringify(receipt));
  assert.strictEqual(receipt.ok, true, JSON.stringify(receipt.cases, null, 2));
  assert.strictEqual(receipt.stable, true);
  assert.strictEqual(receipt.repeats, 3);
  assert.strictEqual(receipt.certificates.optimal, true);
  assert.strictEqual(receipt.certificates.infeasible_iis, true);
  assert.strictEqual(receipt.certificates.unbounded, true);
  assert.strictEqual(receipt.certificates.mip_gap_zero, true);
  assert.strictEqual(receipt.not_plausible_guess, true);
  assert.ok(receipt.environment && receipt.environment.solver === 'Gurobi');
  assert.ok(receipt.environment.settings === 'defaults');
  assert.ok(Array.isArray(receipt.runtime_table) && receipt.runtime_table.length === receipt.cases.length);
  const lpRt = receipt.runtime_table.find((r) => r.case_id === 'lp-model.json');
  assert.ok(lpRt && lpRt.seeds === 3 && lpRt.certificate_reached_frac === 1);
  const heur = receipt.heuristic_vs_solver || [];
  assert.ok(heur.every((h) => h.solver_wins === true), JSON.stringify(heur));
  assert.ok(receipt.migration && receipt.migration.ok);
  assert.ok(receipt.migration.narrowest.includes('tools/gurobi-fleet-optimize.py'));

  const lp = receipt.cases.find((c) => c.id === 'lp-model.json');
  assert.ok(lp && Math.abs(lp.objective - 2.0) < 1e-6);
  assert.match(lp.explain, /Certified OPTIMAL/);

  const iis = receipt.cases.find((c) => c.id === 'infeasible-model.json');
  assert.ok(iis && iis.is_infeasible);
  assert.match(iis.explain, /INFEASIBILITY certificate/);

  const unbounded = receipt.cases.find((c) => c.id === 'unbounded-maximize');
  assert.ok(unbounded);
  assert.ok(unbounded.status === 'UNBOUNDED' || unbounded.status === 'INF_OR_UNBD');
  assert.match(unbounded.explain, /UNBOUNDEDNESS certificate/);

  const cli = spawnSync(process.execPath, [BENCH, '--json', '--repeats', '2'], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 30_000,
  });
  assert.strictEqual(cli.status, 0, cli.stderr || cli.stdout);
  const parsed = JSON.parse(cli.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.repeats, 2);

  console.log(
    `test-gurobi-acceptance-bench: PASS ${receipt.cases.length} cases stable=${receipt.stable} unbounded=${unbounded.status}`,
  );
}

main();
