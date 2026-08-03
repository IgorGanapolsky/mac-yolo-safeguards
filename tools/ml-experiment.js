#!/usr/bin/env node
'use strict';

/**
 * ml-experiment.js — A/B experiment registry with statistical gates (July 2026).
 *
 * Does NOT invent winners. Requires min samples per arm + two-proportion z-test
 * before declaring a significant winner.
 *
 * Store: ~/.hermes/ml/experiments.json
 *
 *   node tools/ml-experiment.js create --id EXP --arm-a control --arm-b treatment [--json]
 *   node tools/ml-experiment.js record --id EXP --arm a|b --success 0|1 [--n N] [--json]
 *   node tools/ml-experiment.js analyze --id EXP [--min-n 30] [--json]
 *   node tools/ml-experiment.js list [--json]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { twoProportionTest } = require('./ml-core');

const STORE = path.join(os.homedir(), '.hermes', 'ml', 'experiments.json');

function parseArgs(argv) {
  const args = {
    command: 'list',
    json: false,
    help: false,
    id: '',
    armA: 'control',
    armB: 'treatment',
    arm: '',
    success: null,
    n: 1,
    minN: 30,
    hypothesis: '',
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('--')) args.command = rest.shift();
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--id') args.id = rest[++i] || '';
    else if (a === '--arm-a') args.armA = rest[++i] || 'control';
    else if (a === '--arm-b') args.armB = rest[++i] || 'treatment';
    else if (a === '--arm') args.arm = String(rest[++i] || '').toLowerCase();
    else if (a === '--success') args.success = Number(rest[++i]);
    else if (a === '--n') args.n = Number(rest[++i]);
    else if (a === '--min-n') args.minN = Number(rest[++i]);
    else if (a === '--hypothesis') args.hypothesis = rest[++i] || '';
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function loadStore() {
  if (!fs.existsSync(STORE)) {
    return { schema_version: 'ml-experiments/1', experiments: {} };
  }
  return JSON.parse(fs.readFileSync(STORE, 'utf8'));
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function create(args) {
  if (!args.id) throw new Error('--id required');
  const store = loadStore();
  if (store.experiments[args.id]) {
    return { ok: false, error: 'experiment_exists', id: args.id };
  }
  store.experiments[args.id] = {
    id: args.id,
    hypothesis: args.hypothesis || '',
    arms: {
      a: { name: args.armA, successes: 0, n: 0 },
      b: { name: args.armB, successes: 0, n: 0 },
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveStore(store);
  return { ok: true, experiment: store.experiments[args.id] };
}

function record(args) {
  if (!args.id) throw new Error('--id required');
  if (args.arm !== 'a' && args.arm !== 'b') throw new Error('--arm a|b required');
  if (args.success !== 0 && args.success !== 1) throw new Error('--success 0|1 required');
  const n = Number.isFinite(args.n) && args.n > 0 ? Math.floor(args.n) : 1;
  const store = loadStore();
  const exp = store.experiments[args.id];
  if (!exp) throw new Error(`unknown experiment: ${args.id}`);
  const arm = exp.arms[args.arm];
  arm.n += n;
  arm.successes += args.success * n;
  exp.updated_at = new Date().toISOString();
  saveStore(store);
  return { ok: true, experiment: exp };
}

function analyze(args) {
  if (!args.id) throw new Error('--id required');
  const store = loadStore();
  const exp = store.experiments[args.id];
  if (!exp) throw new Error(`unknown experiment: ${args.id}`);
  const a = exp.arms.a;
  const b = exp.arms.b;
  const minN = args.minN || 30;
  const underpowered = a.n < minN || b.n < minN;
  const test = twoProportionTest(a.successes, a.n, b.successes, b.n);
  let winner = null;
  let decision = 'continue';
  if (underpowered) {
    decision = 'underpowered';
  } else if (test.significant) {
    winner = test.p1 >= test.p2 ? 'a' : 'b';
    decision = 'declare_winner';
  } else {
    decision = 'no_significant_difference';
  }
  return {
    ok: true,
    id: exp.id,
    hypothesis: exp.hypothesis,
    arms: exp.arms,
    min_n: minN,
    underpowered,
    test,
    winner,
    decision,
    rule:
      'Winner only when both arms n>=min_n AND two-proportion |z|>=1.96 (~p<0.05). Never invent.',
  };
}

function list() {
  const store = loadStore();
  return { ok: true, experiments: store.experiments };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/ml-experiment.js create --id EXP --arm-a control --arm-b treatment [--json]
  node tools/ml-experiment.js record --id EXP --arm a|b --success 0|1 [--n N] [--json]
  node tools/ml-experiment.js analyze --id EXP [--min-n 30] [--json]
  node tools/ml-experiment.js list [--json]`);
    process.exit(0);
  }
  let result;
  if (args.command === 'create') result = create(args);
  else if (args.command === 'record') result = record(args);
  else if (args.command === 'analyze') result = analyze(args);
  else if (args.command === 'list') result = list();
  else throw new Error(`Unknown command: ${args.command}`);

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else if (args.command === 'analyze') {
    console.log(
      `ml-experiment ${result.id}: decision=${result.decision} winner=${result.winner || '-'} ` +
        `a=${result.arms.a.successes}/${result.arms.a.n} b=${result.arms.b.successes}/${result.arms.b.n} ` +
        `z=${result.test.z} p≈${result.test.pApprox}`,
    );
  } else if (args.command === 'list') {
    const ids = Object.keys(result.experiments);
    console.log(`ml-experiment: ${ids.length} experiments`);
    for (const id of ids.slice(0, 20)) console.log(`  ${id}`);
  } else {
    console.log(`ml-experiment ${args.command}: ok=${result.ok}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

module.exports = { create, record, analyze, list, twoProportionTest: require('./ml-core').twoProportionTest };
