#!/usr/bin/env node
'use strict';

/**
 * dst-run.js — CLI entry for deterministic simulation scenarios.
 *
 *   node tools/dst-run.js --scenario task-routing --seed 42 --steps 1000
 *   node tools/dst-run.js --scenario all --seeds 20
 */

const { createRng } = require('./dst-core');
const taskRouting = require('./dst-task-routing');

function parseArgs(argv) {
  const args = {
    scenario: 'task-routing',
    seed: 42,
    steps: 500,
    seeds: 0,
    json: true,
    exhaustive: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--scenario') args.scenario = argv[++i] || args.scenario;
    else if (a === '--seed') args.seed = Number(argv[++i]) || 42;
    else if (a === '--steps') args.steps = Number(argv[++i]) || 500;
    else if (a === '--seeds') args.seeds = Number(argv[++i]) || 0;
    else if (a === '--exhaustive') args.exhaustive = true;
    else if (a === '--help') args.help = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/dst-run.js --scenario task-routing --seed 42 --steps 500
  node tools/dst-run.js --scenario task-routing --seeds 50 --steps 200
  node tools/dst-run.js --scenario task-routing --exhaustive

Scenarios: task-routing | all
`);
    process.exit(0);
  }

  if (args.exhaustive || args.scenario === 'task-routing') {
    if (args.exhaustive) {
      const r = taskRouting.exhaustiveOracle();
      console.log(JSON.stringify({ scenario: 'task-routing-exhaustive', ...r }, null, 2));
      process.exit(r.ok ? 0 : 1);
    }
  }

  const scenarios = args.scenario === 'all' ? ['task-routing'] : [args.scenario];
  const reports = [];
  let ok = true;

  for (const name of scenarios) {
    if (name !== 'task-routing') {
      console.error(`unknown scenario: ${name}`);
      process.exit(2);
    }
    if (args.seeds > 0) {
      const rng = createRng(args.seed);
      const multi = [];
      for (let i = 0; i < args.seeds; i += 1) {
        const seed = rng.int(0xffffffff) || 1;
        const r = taskRouting.runTaskRoutingScenario({ seed, steps: args.steps });
        multi.push({
          seed,
          ok: r.ok,
          violations: r.violations.length,
          states: r.states_explored,
          digest: r.transcript_digest,
        });
        if (!r.ok) {
          ok = false;
          // attach first failing transcript digest for RCA
          multi[multi.length - 1].first_violation = r.violations[0];
        }
      }
      reports.push({ scenario: name, multi_seed: true, results: multi, ok });
    } else {
      const r = taskRouting.runTaskRoutingScenario({ seed: args.seed, steps: args.steps });
      reports.push({
        scenario: name,
        seed: args.seed,
        ok: r.ok,
        violations: r.violations,
        states_explored: r.states_explored,
        transcript_digest: r.transcript_digest,
        steps_executed: r.steps_executed,
      });
      if (!r.ok) ok = false;
    }
  }

  console.log(
    JSON.stringify(
      {
        schema_version: 'dst-run/1',
        inspired_by: 'https://antithesis.com/ (ideas only — local DST, not their hypervisor)',
        ok,
        reports,
      },
      null,
      2,
    ),
  );
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { main };
