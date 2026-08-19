#!/usr/bin/env node
'use strict';

/**
 * Map Gurobi solver touchpoints (Phase One Quick Migration step 01).
 *
 * Steal: replace the solver at the narrowest interface. Keep model JSON,
 * session-start, and agent-loop consumers stable. Do not rewrite AMPL/GAMS.
 *
 *   node tools/gurobi-solver-touchpoints.js [--json]
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

/** Frozen inventory. `swap: true` = narrowest solver boundary. */
const TOUCHPOINTS = [
  {
    layer: 'modeling',
    path: 'examples/gurobi',
    swap: false,
    note: 'Frozen acceptance models (#1869). Do not rewrite to swap solvers.',
  },
  {
    layer: 'solver_boundary',
    path: 'tools/gurobi-fleet-optimize.py',
    swap: true,
    note: 'Narrowest CLI interface. Swap here first; keep downstream JSON.',
  },
  {
    layer: 'solver_lib',
    path: 'tools/gurobi_fleet_lib.py',
    swap: true,
    note: 'gurobipy calls live here. Isolate vendor API to this file.',
  },
  {
    layer: 'mcp',
    path: 'tools/gurobi-mcp-server.py',
    swap: false,
    note: 'Downstream of lib/CLI. Keep tool names; change engine behind them.',
  },
  {
    layer: 'process_gate',
    path: 'tools/gurobi-harness-gate.js',
    swap: false,
    note: 'Session-start consumer. Calls CLI JSON; do not embed gurobipy.',
  },
  {
    layer: 'acceptance',
    path: 'tools/gurobi-acceptance-bench.js',
    swap: false,
    note: 'Gold expected vs live. Grades business outputs, not vendor logs.',
  },
  {
    layer: 'session_start',
    path: 'tools/agent-session-start.js',
    swap: false,
    note: 'Process hook. Must keep calling the gate, not a new solver API.',
  },
  {
    layer: 'agent_loop',
    path: 'bin/agent-loop',
    swap: false,
    note: 'Health observe.gurobi_proof. Downstream of the gate.',
  },
];

function mapTouchpoints(root) {
  const base = root || REPO;
  const items = TOUCHPOINTS.map((tp) => {
    const abs = path.join(base, tp.path);
    return {
      ...tp,
      exists: fs.existsSync(abs),
    };
  });
  const missing = items.filter((i) => !i.exists).map((i) => i.path);
  const narrowest = items.filter((i) => i.swap).map((i) => i.path);
  const keep_stable = items.filter((i) => !i.swap).map((i) => i.path);
  return {
    ok: missing.length === 0,
    phase_one: 'solver_touchpoints',
    rule: 'swap_at_narrowest_interface',
    narrowest,
    keep_stable,
    missing,
    items,
  };
}

function formatHuman(map) {
  const lines = [
    `Gurobi touchpoints ${map.ok ? 'PASS' : 'FAIL'} swap_at=${map.narrowest.join(', ')}`,
    `keep_stable=${map.keep_stable.join(', ')}`,
  ];
  for (const i of map.items) {
    lines.push(`  - ${i.layer}: ${i.path} ${i.exists ? 'ok' : 'MISSING'} swap=${i.swap}`);
  }
  return lines.join('\n');
}

function main(argv) {
  const args = argv || process.argv.slice(2);
  const map = mapTouchpoints();
  if (args.includes('--json')) process.stdout.write(`${JSON.stringify(map)}\n`);
  else process.stdout.write(`${formatHuman(map)}\n`);
  return map.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { TOUCHPOINTS, mapTouchpoints, formatHuman };
