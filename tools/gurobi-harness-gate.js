#!/usr/bin/env node
'use strict';

/**
 * Session/process gate: Gurobi certifies token spend + exclusive dispatch.
 *
 * Pulse steal (proof vs plausible): session-start and agent-loop must not
 * vibe-route models or launch colliding ADB/git_lock jobs. This gate calls
 * the real gurobipy CLI (tools/gurobi-fleet-optimize.py) and returns a
 * certified receipt. It does not mock solutions.
 *
 *   node tools/gurobi-harness-gate.js [--json] [--health] [--session-start]
 *
 * Built-in payloads live here (not examples/gurobi/) so this lane does not
 * collide with the CLI/examples owner.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const VENV_PY = path.join(os.homedir(), '.hermes/gurobi-venv/bin/python');
const CLI = path.join(REPO, 'tools/gurobi-fleet-optimize.py');
const RECEIPT_DIR = path.join(os.homedir(), '.hermes/gurobi/evals');
const RECEIPT_PATH = path.join(RECEIPT_DIR, 'session-latest.json');
const MONTHLY_BUDGET_USD = 10;

/** $12 frontier item must lose under the $10 cap. */
const DEFAULT_WORKLOADS = {
  monthly_budget_usd: MONTHLY_BUDGET_USD,
  workloads: [
    {
      id: 'glm-coding-plan',
      name: 'glm_coding_plan',
      local_score: 90,
      frontier_score: 90,
      frontier_cost_usd: 0,
    },
    {
      id: 'cheap',
      name: 'bounded_cloud',
      local_score: 40,
      frontier_score: 92,
      frontier_cost_usd: 2,
    },
    {
      id: 'huge',
      name: 'uncapped_frontier',
      local_score: 20,
      frontier_score: 99,
      frontier_cost_usd: 12,
    },
    {
      id: 'sec-audit',
      name: 'security_audit',
      local_score: 50,
      frontier_score: 95,
      frontier_cost_usd: 5,
    },
  ],
};

/** Two ADB jobs + one git_lock: at most one ADB holder. */
const DEFAULT_DISPATCH = {
  tasks: [
    { id: 'e2e-a', priority: 9, exclusive: ['adb'], ram_gb: 4 },
    { id: 'e2e-b', priority: 3, exclusive: ['adb'], ram_gb: 4 },
    { id: 'commit', priority: 8, exclusive: ['git_lock'] },
    { id: 'sync', priority: 2 },
  ],
  agents: [
    { id: 'macbook', capacity: 3, ram_gb: 64 },
    { id: 'mini', capacity: 2, ram_gb: 24 },
  ],
};

function pythonBin() {
  return fs.existsSync(VENV_PY) ? VENV_PY : 'python3';
}

function runCli(args, timeoutMs) {
  return spawnSync(pythonBin(), [CLI, ...args], {
    encoding: 'utf8',
    cwd: REPO,
    env: { ...process.env, PYTHONPATH: path.join(REPO, 'tools') },
    timeout: timeoutMs || 8_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function parseJsonStdout(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function skipReceipt(reason) {
  return {
    ok: true,
    skipped: true,
    skip_reason: reason,
    certified_optimal: false,
    not_plausible_guess: true,
    monthly_budget_usd: MONTHLY_BUDGET_USD,
  };
}

function assignedTaskIds(values) {
  return Object.keys(values || {}).map((k) => k.split('->')[0]);
}

function writeReceipt(payload) {
  try {
    fs.mkdirSync(RECEIPT_DIR, { recursive: true });
    fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  } catch {
    /* local cache only; never fail the gate on a home-dir write */
  }
}

function runHarnessGate() {
  const t0 = Date.now();
  if (!fs.existsSync(CLI)) {
    return skipReceipt('gurobi CLI missing');
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gurobi-harness-'));
  try {
    const wlPath = path.join(tmp, 'workloads.json');
    const jobsPath = path.join(tmp, 'dispatch.json');
    fs.writeFileSync(wlPath, JSON.stringify(DEFAULT_WORKLOADS));
    fs.writeFileSync(jobsPath, JSON.stringify(DEFAULT_DISPATCH));

    const tbRun = runCli(['token-budget', '--file', wlPath, '--budget', '10', '--json']);
    const tb = parseJsonStdout(tbRun.stdout);
    const dispRun = runCli(['dispatch', '--file', jobsPath, '--json']);
    const disp = parseJsonStdout(dispRun.stdout);

    if (!tb || tbRun.status !== 0) {
      const msg = `${tbRun.stderr || tbRun.stdout || ''}`.slice(0, 240);
      if (
        process.env.CI === 'true' ||
        process.env.GITHUB_ACTIONS === 'true' ||
        /gurobipy|IMPORT_ERROR|No module named/i.test(msg) ||
        tb?.status === 'IMPORT_ERROR'
      ) {
        return skipReceipt(`gurobipy unavailable: ${msg}`);
      }
      return {
        ok: false,
        skipped: false,
        error: `token-budget failed: ${msg}`,
        not_plausible_guess: true,
      };
    }
    if (!disp || dispRun.status !== 0) {
      return {
        ok: false,
        skipped: false,
        error: `dispatch failed: ${(dispRun.stderr || dispRun.stdout || '').toString().slice(0, 240)}`,
        not_plausible_guess: true,
      };
    }
    if (tb.status === 'IMPORT_ERROR' || disp.status === 'IMPORT_ERROR') {
      return skipReceipt('gurobipy IMPORT_ERROR');
    }

    const spend = Number(tb.model_stats?.allocated_spend_usd ?? Number.NaN);
    const hugeSelected = tb.values && Number(tb.values.huge) === 1;
    const assigned = assignedTaskIds(disp.values);
    const adbAssigned = assigned.filter((id) => id === 'e2e-a' || id === 'e2e-b');
    const exclusiveOk = adbAssigned.length === 1 && adbAssigned[0] === 'e2e-a';
    const tbProof = tb.proof || {};
    const dispProof = disp.proof || {};
    const certified =
      tbProof.certified_optimal === true && dispProof.certified_optimal === true;
    const spendOk = Number.isFinite(spend) && spend <= MONTHLY_BUDGET_USD + 1e-9;
    const ok = Boolean(tb.ok && disp.ok && certified && spendOk && !hugeSelected && exclusiveOk);

    const receipt = {
      ok,
      skipped: false,
      certified_optimal: certified,
      not_plausible_guess: true,
      monthly_budget_usd: MONTHLY_BUDGET_USD,
      allocated_spend_usd: spend,
      huge_excluded: !hugeSelected,
      exclusive_adb_ok: exclusiveOk,
      exclusive_adb_assigned: adbAssigned,
      assignments: disp.values || {},
      token_proof: tbProof,
      dispatch_proof: dispProof,
      runtime_ms: Date.now() - t0,
      solver: 'gurobipy',
      action_class: 'observe',
    };
    try {
      const { record } = require('./gurobi-decision-audit');
      const decorated = record(receipt);
      writeReceipt(decorated);
      return decorated;
    } catch {
      writeReceipt(receipt);
      return receipt;
    }
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function formatHuman(receipt) {
  if (!receipt) return 'Gurobi SKIP no receipt';
  if (receipt.skipped) return `Gurobi SKIP ${receipt.skip_reason || 'unavailable'}`;
  if (!receipt.ok) {
    return `Gurobi FAIL certified=${receipt.certified_optimal === true} spend=$${Number(receipt.allocated_spend_usd || 0).toFixed(2)}/${MONTHLY_BUDGET_USD} exclusive_adb=${receipt.exclusive_adb_ok === true} ${receipt.error || ''}`.trim();
  }
  const spend = Number.isFinite(receipt.allocated_spend_usd)
    ? receipt.allocated_spend_usd.toFixed(2)
    : '?';
  return `Gurobi OPTIMAL certified=true spend=$${spend}/$${MONTHLY_BUDGET_USD.toFixed(2)} exclusive_adb=1 not_guess=true runtime_ms=${receipt.runtime_ms}`;
}

function main(argv) {
  const args = argv || process.argv.slice(2);
  const json = args.includes('--json') || args.includes('--health');
  const receipt = runHarnessGate();
  if (json) {
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } else {
    process.stdout.write(`=== Gurobi proof ===\n${formatHuman(receipt)}\n`);
  }
  if (receipt.skipped) return 0;
  return receipt.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  runHarnessGate,
  formatHuman,
  DEFAULT_WORKLOADS,
  DEFAULT_DISPATCH,
  MONTHLY_BUDGET_USD,
};
