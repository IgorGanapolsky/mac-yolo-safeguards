#!/usr/bin/env node
'use strict';

/**
 * ml-serve.js — production inference for propensity (batch + single).
 *
 * Uses production registry model when present, else ~/.hermes/ml/propensity-model.json.
 * Fail-closed: untrained → scores null with reason, never invents high propensity.
 *
 *   node tools/ml-serve.js score --features '{...}' [--json]
 *   node tools/ml-serve.js batch --tsv PATH [--json] [--out PATH]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  FEATURE_KEYS,
  featuresToArray,
  featureVectorFromProspect,
} = require('./ml-label-store');
const { predictProba } = require('./ml-core');

const DEFAULT_MODEL = path.join(os.homedir(), '.hermes', 'ml', 'propensity-model.json');

function parseArgs(argv) {
  const args = {
    command: 'score',
    json: false,
    help: false,
    features: '',
    tsv: '',
    out: '',
    model: '',
    threshold: 0.5,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('--')) args.command = rest.shift();
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--features') args.features = rest[++i] || '';
    else if (a === '--tsv') args.tsv = path.resolve(rest[++i] || '');
    else if (a === '--out') args.out = path.resolve(rest[++i] || '');
    else if (a === '--model') args.model = path.resolve(rest[++i] || '');
    else if (a === '--threshold') args.threshold = Number(rest[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function resolveModelPath(explicit) {
  if (explicit && fs.existsSync(explicit)) return explicit;
  try {
    const reg = require('./ml-registry');
    const prod = reg.production();
    if (prod.entry?.path && fs.existsSync(prod.entry.path)) return prod.entry.path;
  } catch {
    /* no registry */
  }
  return DEFAULT_MODEL;
}

function loadModel(modelPath) {
  if (!fs.existsSync(modelPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  } catch {
    return null;
  }
}

function scoreOne(model, featuresObj, threshold) {
  if (!model || !model.trained) {
    return {
      ok: false,
      probability_paid: null,
      decision: 'no_model',
      reason: model?.status || 'missing_model',
    };
  }
  const fmap =
    featuresObj.agent_stack !== undefined && featuresObj.segment_agency === undefined
      ? featureVectorFromProspect(featuresObj)
      : featuresObj;
  const x = featuresToArray(fmap);
  const p = predictProba(
    { weights: model.weights, bias: model.bias, calibration: model.calibration },
    x,
  );
  return {
    ok: true,
    probability_paid: Number(p.toFixed(4)),
    decision: p >= threshold ? 'high_propensity' : 'low_propensity',
    calibrated: Boolean(model.calibration?.fitted),
    model_generated_at: model.generated_at,
    holdout_auc: model.holdout_metrics?.auc ?? null,
  };
}

function parseTsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  return lines.map((line) => {
    const values = line.split('\t');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

function batch(args) {
  const modelPath = resolveModelPath(args.model);
  const model = loadModel(modelPath);
  const rows = parseTsv(args.tsv);
  const scored = rows.map((row) => {
    const result = scoreOne(model, row, args.threshold);
    return {
      prospect_label: row.prospect_label || '',
      ...result,
      heuristic_note: result.ok
        ? 'model_score'
        : 'fail_closed_use_prospect_score_heuristic',
    };
  });
  if (args.out) {
    const header = [
      'prospect_label',
      'probability_paid',
      'decision',
      'ok',
      'reason',
      'calibrated',
    ];
    const lines = [header.join('\t')];
    for (const s of scored) {
      lines.push(
        [
          s.prospect_label,
          s.probability_paid ?? '',
          s.decision,
          s.ok,
          s.reason || '',
          s.calibrated ?? '',
        ].join('\t'),
      );
    }
    fs.writeFileSync(args.out, lines.join('\n') + '\n', 'utf8');
  }
  return {
    ok: true,
    model_path: modelPath,
    model_trained: Boolean(model?.trained),
    n: scored.length,
    high: scored.filter((s) => s.decision === 'high_propensity').length,
    rows: scored,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/ml-serve.js score --features '{...}' [--json]
  node tools/ml-serve.js batch --tsv PATH [--out PATH] [--json]`);
    process.exit(0);
  }
  let result;
  if (args.command === 'score') {
    const model = loadModel(resolveModelPath(args.model));
    if (!args.features) throw new Error('--features required');
    result = scoreOne(model, JSON.parse(args.features), args.threshold);
    result.model_path = resolveModelPath(args.model);
  } else if (args.command === 'batch') {
    if (!args.tsv) throw new Error('--tsv required');
    result = batch(args);
  } else throw new Error(`Unknown command: ${args.command}`);

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else if (args.command === 'score') {
    if (!result.ok) {
      console.log(`ml-serve: ${result.decision} (${result.reason})`);
      process.exitCode = 2;
    } else {
      console.log(
        `ml-serve: p=${result.probability_paid} ${result.decision} calibrated=${result.calibrated}`,
      );
    }
  } else {
    console.log(
      `ml-serve batch: n=${result.n} high=${result.high} trained=${result.model_trained}`,
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

module.exports = { scoreOne, batch, resolveModelPath, loadModel, FEATURE_KEYS };
