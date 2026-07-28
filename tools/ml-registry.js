#!/usr/bin/env node
'use strict';

/**
 * ml-registry.js — versioned model registry (July 2026 best-practice layout).
 *
 * Store: ~/.hermes/ml/registry/
 *   index.json          — list of models + production pointer
 *   models/<id>.json    — immutable model artifact copies
 *
 *   node tools/ml-registry.js list [--json]
 *   node tools/ml-registry.js register --model PATH [--name propensity] [--json]
 *   node tools/ml-registry.js promote --id MODEL_ID [--json]
 *   node tools/ml-registry.js production [--json]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ML_DIR = path.join(os.homedir(), '.hermes', 'ml');
const REG_DIR = path.join(ML_DIR, 'registry');
const INDEX = path.join(REG_DIR, 'index.json');
const MODELS_DIR = path.join(REG_DIR, 'models');

function parseArgs(argv) {
  const args = {
    command: 'list',
    json: false,
    help: false,
    model: '',
    name: 'propensity',
    id: '',
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('--')) args.command = rest.shift();
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--model') args.model = path.resolve(rest[++i] || '');
    else if (a === '--name') args.name = rest[++i] || 'propensity';
    else if (a === '--id') args.id = rest[++i] || '';
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function loadIndex() {
  if (!fs.existsSync(INDEX)) {
    return {
      schema_version: 'ml-registry/1',
      production: null,
      models: [],
      updated_at: null,
    };
  }
  return JSON.parse(fs.readFileSync(INDEX, 'utf8'));
}

function saveIndex(index) {
  fs.mkdirSync(REG_DIR, { recursive: true });
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  index.updated_at = new Date().toISOString();
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

function register(args) {
  if (!args.model || !fs.existsSync(args.model)) {
    throw new Error('--model PATH required and must exist');
  }
  const body = JSON.parse(fs.readFileSync(args.model, 'utf8'));
  if (!body.trained) {
    return {
      ok: false,
      error: 'refusing to register untrained / insufficient_labels model',
      status: body.status || 'untrained',
    };
  }
  const digest = sha256File(args.model).slice(0, 12);
  const id = `${args.name}-${body.generated_at?.replace(/[:.]/g, '-') || Date.now()}-${digest}`;
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const dest = path.join(MODELS_DIR, `${id}.json`);
  fs.copyFileSync(args.model, dest);
  fs.chmodSync(dest, 0o600);
  const index = loadIndex();
  const entry = {
    id,
    name: args.name,
    path: dest,
    sha256: sha256File(dest),
    trained: true,
    holdout_auc: body.holdout_metrics?.auc ?? null,
    cv_mean_auc: body.cv?.mean_auc ?? null,
    brier: body.holdout_metrics?.brier ?? null,
    positives: body.positives,
    total: body.total,
    registered_at: new Date().toISOString(),
    production: false,
  };
  index.models = index.models.filter((m) => m.id !== id);
  index.models.unshift(entry);
  saveIndex(index);
  return { ok: true, entry, index_path: INDEX };
}

function promote(args) {
  if (!args.id) throw new Error('--id MODEL_ID required');
  const index = loadIndex();
  const entry = index.models.find((m) => m.id === args.id);
  if (!entry) throw new Error(`unknown model id: ${args.id}`);
  index.models.forEach((m) => {
    m.production = m.id === args.id;
  });
  index.production = args.id;
  saveIndex(index);
  // also point default propensity-model.json at production for serve/score
  const defaultPath = path.join(ML_DIR, 'propensity-model.json');
  fs.copyFileSync(entry.path, defaultPath);
  fs.chmodSync(defaultPath, 0o600);
  return { ok: true, production: args.id, default_model: defaultPath };
}

function production() {
  const index = loadIndex();
  const entry = index.models.find((m) => m.id === index.production) || null;
  return { ok: true, production: index.production, entry };
}

function list() {
  const index = loadIndex();
  return { ok: true, ...index };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/ml-registry.js list [--json]
  node tools/ml-registry.js register --model PATH [--name propensity] [--json]
  node tools/ml-registry.js promote --id MODEL_ID [--json]
  node tools/ml-registry.js production [--json]`);
    process.exit(0);
  }
  let result;
  if (args.command === 'list') result = list();
  else if (args.command === 'register') result = register(args);
  else if (args.command === 'promote') result = promote(args);
  else if (args.command === 'production') result = production();
  else throw new Error(`Unknown command: ${args.command}`);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else if (args.command === 'list') {
    console.log(`ml-registry: ${result.models.length} models; production=${result.production || 'none'}`);
    for (const m of result.models.slice(0, 10)) {
      console.log(
        `  ${m.production ? '*' : ' '} ${m.id} auc=${m.holdout_auc} cv=${m.cv_mean_auc} n=${m.total}`,
      );
    }
  } else if (args.command === 'register') {
    if (!result.ok) {
      console.log(`ml-registry register: ${result.error}`);
      process.exitCode = 2;
    } else console.log(`ml-registry: registered ${result.entry.id}`);
  } else if (args.command === 'promote') {
    console.log(`ml-registry: production → ${result.production}`);
  } else {
    console.log(
      `ml-registry production: ${result.production || 'none'}${result.entry ? ` auc=${result.entry.holdout_auc}` : ''}`,
    );
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

module.exports = { register, promote, production, list, loadIndex, REG_DIR, INDEX };
