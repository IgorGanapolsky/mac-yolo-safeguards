#!/usr/bin/env node
'use strict';

/**
 * Frozen Gurobi acceptance bench (Phase One Champion Kit steal).
 *
 * From Gurobi "Evaluating and Benchmarking Solvers" + "Quick Migration":
 *   1. Freeze an acceptance set (do not bench a moving model).
 *   2. Log solver metrics: status, obj_val, obj_bound, mip_gap, wall-clock.
 *   3. Repeat for stability (same environment; we prove determinism).
 *   4. Record the four solver certificates: OPTIMAL, MIP-gap bound,
 *      IIS infeasible, UNBOUNDED.
 *
 * From "LLMs and Optimization": LLM explains; solver proves.
 * This file is the Computation-layer log + a one-line explain receipt.
 *
 * Does NOT edit examples/gurobi/ (frozen by #1869) or the CLI/lib.
 *
 *   node tools/gurobi-acceptance-bench.js [--json] [--repeats 3]
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const VENV_PY = path.join(os.homedir(), '.hermes/gurobi-venv/bin/python');
const CLI = path.join(REPO, 'tools/gurobi-fleet-optimize.py');
const EXAMPLES = path.join(REPO, 'examples', 'gurobi');
const RECEIPT_DIR = path.join(os.homedir(), '.hermes/gurobi/evals');
const RECEIPT_PATH = path.join(RECEIPT_DIR, 'acceptance-latest.json');
const DEFAULT_REPEATS = 3;

/** Frozen expected business outputs. Do not "grade your own homework". */
const GOLD = {
  'lp-model.json': { cmd: 'solve', status: 'OPTIMAL', objective: 2.0 },
  'infeasible-model.json': { cmd: 'iis', is_infeasible: true },
  'token-budget-workloads.json': { cmd: 'token-budget', spend_max: 10 },
};

const UNBOUNDED_MODEL = {
  variables: [{ name: 'x', lb: 0 }],
  constraints: [],
  objective: { x: 1 },
  sense: 'maximize',
};

function pythonBin() {
  return fs.existsSync(VENV_PY) ? VENV_PY : 'python3';
}

function runCli(args) {
  return spawnSync(pythonBin(), [CLI, ...args], {
    encoding: 'utf8',
    cwd: REPO,
    env: { ...process.env, PYTHONPATH: path.join(REPO, 'tools') },
    timeout: 8_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function parseJson(raw) {
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

function skip(reason) {
  return {
    ok: true,
    skipped: true,
    skip_reason: reason,
    phase_one: 'acceptance_bench',
  };
}

function metricsFrom(result) {
  const proof = result.proof || {};
  return {
    status: result.status || (result.is_infeasible ? 'INFEASIBLE' : null),
    ok: result.ok === true,
    is_infeasible: result.is_infeasible === true,
    objective: result.objective,
    obj_val: proof.obj_val,
    obj_bound: proof.obj_bound,
    mip_gap: proof.mip_gap,
    certified_optimal: proof.certified_optimal === true,
    not_plausible_guess: proof.not_plausible_guess === true,
    runtime_sec: proof.runtime_sec ?? result.runtime_sec,
    iis_constraints: result.iis_constraints || (result.iis && result.iis.iis_constraints) || [],
    allocated_spend_usd: result.model_stats && result.model_stats.allocated_spend_usd,
  };
}

function explain(row) {
  if (row.certified_optimal) {
    const bits = [`Certified OPTIMAL (not a plausible guess). obj=${row.obj_val} bound=${row.obj_bound}`];
    if (row.mip_gap != null) bits.push(`mip_gap=${row.mip_gap}`);
    return `${bits.join(' ')}.`;
  }
  if (row.is_infeasible) {
    const iis = (row.iis_constraints || []).join(', ') || '(unnamed)';
    return `INFEASIBILITY certificate. IIS: ${iis}. No feasible plan exists.`;
  }
  if (row.status === 'UNBOUNDED' || row.status === 'INF_OR_UNBD') {
    return 'UNBOUNDEDNESS certificate. Objective can improve without limit.';
  }
  return `Status ${row.status}. Not certified optimal.`;
}

function scoreCase(name, gold, row) {
  const failures = [];
  if (gold.status && row.status !== gold.status) {
    failures.push(`status ${row.status} != ${gold.status}`);
  }
  if (gold.is_infeasible && !row.is_infeasible) {
    failures.push('expected IIS infeasible');
  }
  if (typeof gold.objective === 'number') {
    if (!Number.isFinite(row.objective) || Math.abs(row.objective - gold.objective) > 1e-6) {
      failures.push(`objective ${row.objective} != ${gold.objective}`);
    }
  }
  if (typeof gold.spend_max === 'number') {
    if (!Number.isFinite(row.allocated_spend_usd) || row.allocated_spend_usd > gold.spend_max + 1e-9) {
      failures.push(`spend ${row.allocated_spend_usd} > ${gold.spend_max}`);
    }
  }
  if (gold.unbounded) {
    if (row.status !== 'UNBOUNDED' && row.status !== 'INF_OR_UNBD') {
      failures.push(`expected unbounded, got ${row.status}`);
    }
  }
  return { pass: failures.length === 0, failures, explain: explain(row) };
}

function runOnce(unboundedPath) {
  const cases = [];
  for (const [file, gold] of Object.entries(GOLD)) {
    const modelPath = path.join(EXAMPLES, file);
    const r = runCli([gold.cmd, '--file', modelPath, '--json']);
    const parsed = parseJson(r.stdout);
    if (!parsed || r.status !== 0 && gold.cmd !== 'iis') {
      cases.push({
        id: file,
        pass: false,
        failures: [`cli exit ${r.status}: ${(r.stderr || r.stdout || '').toString().slice(0, 200)}`],
      });
      continue;
    }
    const row = metricsFrom(parsed);
    const scored = scoreCase(file, gold, row);
    cases.push({ id: file, cmd: gold.cmd, ...row, ...scored });
  }

  const u = runCli(['solve', '--file', unboundedPath, '--json']);
  const uParsed = parseJson(u.stdout) || {};
  const uRow = metricsFrom(uParsed);
  const uScored = scoreCase('unbounded', { unbounded: true }, uRow);
  cases.push({ id: 'unbounded-maximize', cmd: 'solve', ...uRow, ...uScored });
  return cases;
}

function runAcceptanceBench(opts) {
  const repeats = Number(opts && opts.repeats) > 0 ? Number(opts.repeats) : DEFAULT_REPEATS;
  if (!fs.existsSync(CLI)) return skip('gurobi CLI missing');
  if (!fs.existsSync(EXAMPLES)) return skip('examples/gurobi missing');

  const probe = runCli(['license', '--json']);
  const lic = parseJson(probe.stdout);
  if (!lic || !lic.gurobipy_import_ok) {
    if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
      return skip('CI without gurobipy');
    }
    return skip('gurobipy not importable');
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gurobi-accept-'));
  const unboundedPath = path.join(tmp, 'unbounded.json');
  try {
    fs.writeFileSync(unboundedPath, JSON.stringify(UNBOUNDED_MODEL));
    const rounds = [];
    for (let i = 0; i < repeats; i += 1) {
      rounds.push({ seed_index: i, cases: runOnce(unboundedPath) });
    }

    const first = rounds[0].cases;
    const stable = rounds.every((round) =>
      round.cases.every((c, idx) => {
        const a = first[idx];
        return a && c.id === a.id && c.status === a.status && c.pass === a.pass;
      }),
    );
    const allPass = first.every((c) => c.pass) && stable;
    const certificates = {
      optimal: first.some((c) => c.certified_optimal),
      infeasible_iis: first.some((c) => c.is_infeasible),
      unbounded: first.some((c) => c.status === 'UNBOUNDED' || c.status === 'INF_OR_UNBD'),
      mip_gap_zero: first.some((c) => c.certified_optimal && c.mip_gap === 0),
    };

    const receipt = {
      ok: allPass,
      skipped: false,
      phase_one: 'acceptance_bench',
      frozen_set: Object.keys(GOLD).concat(['unbounded-maximize']),
      repeats,
      stable,
      certificates,
      not_plausible_guess: true,
      cases: first,
      rounds: rounds.map((r) => ({
        seed_index: r.seed_index,
        statuses: r.cases.map((c) => [c.id, c.status, c.pass]),
      })),
    };
    try {
      fs.mkdirSync(RECEIPT_DIR, { recursive: true });
      fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`);
    } catch {
      /* local cache only */
    }
    return receipt;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function formatHuman(receipt) {
  if (!receipt) return 'Gurobi acceptance SKIP';
  if (receipt.skipped) return `Gurobi acceptance SKIP ${receipt.skip_reason}`;
  const certs = receipt.certificates || {};
  const n = (receipt.cases || []).filter((c) => c.pass).length;
  const t = (receipt.cases || []).length;
  return [
    `Gurobi acceptance ${receipt.ok ? 'PASS' : 'FAIL'} ${n}/${t} frozen cases`,
    `stable=${receipt.stable} repeats=${receipt.repeats}`,
    `certs optimal=${certs.optimal} iis=${certs.infeasible_iis} unbounded=${certs.unbounded} mip_gap0=${certs.mip_gap_zero}`,
    ...(receipt.cases || []).map((c) => `  - ${c.id}: ${c.explain || c.status}`),
  ].join('\n');
}

function main(argv) {
  const args = argv || process.argv.slice(2);
  const json = args.includes('--json');
  const ri = args.indexOf('--repeats');
  const repeats = ri >= 0 ? Number(args[ri + 1]) : DEFAULT_REPEATS;
  const receipt = runAcceptanceBench({ repeats });
  if (json) process.stdout.write(`${JSON.stringify(receipt)}\n`);
  else process.stdout.write(`${formatHuman(receipt)}\n`);
  if (receipt.skipped) return 0;
  return receipt.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  runAcceptanceBench,
  formatHuman,
  explain,
  GOLD,
  UNBOUNDED_MODEL,
};
