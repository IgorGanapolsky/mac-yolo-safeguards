#!/usr/bin/env node
'use strict';

/**
 * ml-propensity-train.js — pure-JS logistic regression for paid propensity.
 *
 * No sklearn/torch dependency. Fail-closed when labels are insufficient:
 *   positives < MIN_POS or total < MIN_TOTAL → insufficient_labels (no fake AUC).
 *
 * Time-based holdout: last 20% of rows by last_touch (or insertion order).
 *
 *   node tools/ml-propensity-train.js train [--labels PATH] [--json]
 *   node tools/ml-propensity-train.js score --features '{"agent_stack":1,...}' [--json]
 *   node tools/ml-propensity-train.js status [--json]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  FEATURE_KEYS,
  featuresToArray,
  featureVectorFromProspect,
} = require('./ml-label-store');

const DEFAULT_ML_DIR = path.join(os.homedir(), '.hermes', 'ml');
const DEFAULT_LABELS = path.join(DEFAULT_ML_DIR, 'labels.jsonl');
const DEFAULT_MODEL = path.join(DEFAULT_ML_DIR, 'propensity-model.json');

const MIN_POS = 5;
const MIN_TOTAL = 20;
const HOLDOUT_FRAC = 0.2;
const LR = 0.35;
const EPOCHS = 400;
const L2 = 0.02;

function parseArgs(argv) {
  const args = {
    command: 'status',
    json: false,
    help: false,
    labels: DEFAULT_LABELS,
    modelOut: DEFAULT_MODEL,
    features: '',
    force: false,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('--')) args.command = rest.shift();
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--labels') args.labels = path.resolve(rest[++i] || '');
    else if (a === '--model-out' || a === '--out') args.modelOut = path.resolve(rest[++i] || '');
    else if (a === '--features') args.features = rest[++i] || '';
    else if (a === '--force') args.force = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function sigmoid(z) {
  const x = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-x));
}

function loadTrainingRows(labelsPath) {
  if (!fs.existsSync(labelsPath)) return [];
  const text = fs.readFileSync(labelsPath, 'utf8').trim();
  if (!text) return [];
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row = JSON.parse(line);
    if (row.training_eligible === false) continue;
    // Accept prospect-shaped fixture rows (normalize features → x).
    if (!Array.isArray(row.x) || row.x.length !== FEATURE_KEYS.length) {
      if (row.agent_stack !== undefined || row.features) {
        const features = row.features || featureVectorFromProspect(row);
        row = {
          ...row,
          features,
          x: featuresToArray(features),
          label_paid: Number(row.label_paid) ? 1 : 0,
        };
      } else {
        continue;
      }
    }
    if (row.label_paid !== 0 && row.label_paid !== 1) continue;
    if (!Array.isArray(row.x) || row.x.length !== FEATURE_KEYS.length) continue;
    rows.push(row);
  }
  return rows;
}

function sortByTime(rows) {
  return [...rows].sort((a, b) => {
    const ta = String(a.last_touch || a.as_of || '');
    const tb = String(b.last_touch || b.as_of || '');
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

function splitHoldout(rows) {
  const sorted = sortByTime(rows);
  if (sorted.length < 5) return { train: sorted, holdout: [] };
  const nHold = Math.max(1, Math.floor(sorted.length * HOLDOUT_FRAC));
  const cut = sorted.length - nHold;
  return { train: sorted.slice(0, cut), holdout: sorted.slice(cut) };
}

function trainLogistic(trainRows) {
  const dim = FEATURE_KEYS.length;
  const w = new Array(dim).fill(0);
  let b = 0;
  for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
    let gradW = new Array(dim).fill(0);
    let gradB = 0;
    for (const row of trainRows) {
      const z = b + row.x.reduce((s, xi, i) => s + w[i] * xi, 0);
      const p = sigmoid(z);
      const err = p - row.label_paid;
      for (let i = 0; i < dim; i += 1) gradW[i] += err * row.x[i];
      gradB += err;
    }
    const n = trainRows.length || 1;
    for (let i = 0; i < dim; i += 1) {
      gradW[i] = gradW[i] / n + L2 * w[i];
      w[i] -= LR * gradW[i];
    }
    b -= LR * (gradB / n);
  }
  return { weights: w, bias: b };
}

function predictProba(model, x) {
  const z = model.bias + model.weights.reduce((s, wi, i) => s + wi * (x[i] || 0), 0);
  return sigmoid(z);
}

function metrics(model, rows) {
  if (!rows.length) {
    return { n: 0, accuracy: null, auc: null, logloss: null, pos: 0, neg: 0 };
  }
  let correct = 0;
  let logloss = 0;
  const scores = [];
  let pos = 0;
  let neg = 0;
  for (const row of rows) {
    const p = predictProba(model, row.x);
    const yhat = p >= 0.5 ? 1 : 0;
    if (yhat === row.label_paid) correct += 1;
    const pp = Math.min(1 - 1e-9, Math.max(1e-9, p));
    logloss += -(row.label_paid * Math.log(pp) + (1 - row.label_paid) * Math.log(1 - pp));
    scores.push({ p, y: row.label_paid });
    if (row.label_paid === 1) pos += 1;
    else neg += 1;
  }
  return {
    n: rows.length,
    pos,
    neg,
    accuracy: Number((correct / rows.length).toFixed(4)),
    logloss: Number((logloss / rows.length).toFixed(4)),
    auc: aucROC(scores),
  };
}

/** Mann-Whitney AUC; null if only one class present. */
function aucROC(scores) {
  const pos = scores.filter((s) => s.y === 1);
  const neg = scores.filter((s) => s.y === 0);
  if (!pos.length || !neg.length) return null;
  let rankSum = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p.p > n.p) rankSum += 1;
      else if (p.p === n.p) rankSum += 0.5;
    }
  }
  return Number((rankSum / (pos.length * neg.length)).toFixed(4));
}

function train(args) {
  const rows = loadTrainingRows(args.labels);
  const positives = rows.filter((r) => r.label_paid === 1).length;
  const negatives = rows.filter((r) => r.label_paid === 0).length;
  const insufficient =
    !args.force && (positives < MIN_POS || rows.length < MIN_TOTAL);

  if (insufficient) {
    const report = {
      ok: false,
      status: 'insufficient_labels',
      message:
        `Need >=${MIN_POS} paid positives and >=${MIN_TOTAL} training rows; ` +
        `have pos=${positives} total=${rows.length}. Fail-closed: no fake model.`,
      positives,
      negatives,
      total: rows.length,
      min_pos: MIN_POS,
      min_total: MIN_TOTAL,
      model_path: args.modelOut,
      trained: false,
    };
    // Write explicit insufficient receipt so SYSTEM_SCORES can read it.
    fs.mkdirSync(path.dirname(args.modelOut), { recursive: true });
    fs.writeFileSync(
      args.modelOut,
      JSON.stringify(
        {
          schema_version: 'ml-propensity-model/1',
          status: 'insufficient_labels',
          trained: false,
          positives,
          negatives,
          total: rows.length,
          feature_keys: FEATURE_KEYS,
          generated_at: new Date().toISOString(),
          note: report.message,
        },
        null,
        2,
      ) + '\n',
      { encoding: 'utf8', mode: 0o600 },
    );
    return report;
  }

  const { train: trainRows, holdout } = splitHoldout(rows);
  const fit = trainLogistic(trainRows);
  const trainMetrics = metrics(fit, trainRows);
  const holdoutMetrics = metrics(fit, holdout);
  const model = {
    schema_version: 'ml-propensity-model/1',
    status: 'trained',
    trained: true,
    feature_keys: FEATURE_KEYS,
    weights: fit.weights.map((w) => Number(w.toFixed(6))),
    bias: Number(fit.bias.toFixed(6)),
    hyperparameters: { lr: LR, epochs: EPOCHS, l2: L2, holdout_frac: HOLDOUT_FRAC },
    train_metrics: trainMetrics,
    holdout_metrics: holdoutMetrics,
    positives,
    negatives,
    total: rows.length,
    generated_at: new Date().toISOString(),
    labels_path: args.labels,
  };
  fs.mkdirSync(path.dirname(args.modelOut), { recursive: true });
  fs.writeFileSync(args.modelOut, JSON.stringify(model, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
  return {
    ok: true,
    status: 'trained',
    trained: true,
    model_path: args.modelOut,
    train_metrics: trainMetrics,
    holdout_metrics: holdoutMetrics,
    positives,
    negatives,
    total: rows.length,
  };
}

function loadModel(modelPath) {
  if (!fs.existsSync(modelPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  } catch {
    return null;
  }
}

function score(args) {
  const model = loadModel(args.modelOut);
  if (!model || !model.trained) {
    return {
      ok: false,
      status: model?.status || 'no_model',
      message: 'No trained propensity model; run train after labels are ready.',
    };
  }
  let features;
  if (args.features) {
    features = JSON.parse(args.features);
  } else {
    throw new Error('--features JSON required for score');
  }
  // Accept either full feature map or prospect-shaped row
  const fmap =
    features.agent_stack !== undefined && features.segment_agency === undefined
      ? featureVectorFromProspect(features)
      : features;
  const x = featuresToArray(fmap);
  const p = predictProba(
    { weights: model.weights, bias: model.bias },
    x,
  );
  return {
    ok: true,
    probability_paid: Number(p.toFixed(4)),
    decision: p >= 0.5 ? 'high_propensity' : 'low_propensity',
    features: fmap,
    model_generated_at: model.generated_at,
  };
}

function status(args) {
  const model = loadModel(args.modelOut);
  return {
    ok: true,
    model_path: args.modelOut,
    present: Boolean(model),
    trained: Boolean(model?.trained),
    status: model?.status || 'missing',
    holdout_auc: model?.holdout_metrics?.auc ?? null,
    positives: model?.positives ?? null,
    total: model?.total ?? null,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/ml-propensity-train.js train [--labels PATH] [--json]
  node tools/ml-propensity-train.js score --features '{...}' [--json]
  node tools/ml-propensity-train.js status [--json]`);
    process.exit(0);
  }
  let result;
  if (args.command === 'train') result = train(args);
  else if (args.command === 'score') result = score(args);
  else if (args.command === 'status') result = status(args);
  else throw new Error(`Unknown command: ${args.command}`);

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else if (args.command === 'train') {
    if (result.trained) {
      console.log(
        `ml-propensity: trained pos=${result.positives}/${result.total} holdout_auc=${result.holdout_metrics?.auc} → ${result.model_path}`,
      );
    } else {
      console.log(`ml-propensity: ${result.status} — ${result.message}`);
      process.exitCode = 2;
    }
  } else if (args.command === 'score') {
    if (!result.ok) {
      console.log(`ml-propensity score: ${result.status}`);
      process.exitCode = 2;
    } else {
      console.log(
        `ml-propensity score: p_paid=${result.probability_paid} (${result.decision})`,
      );
    }
  } else {
    console.log(
      `ml-propensity status: ${result.status} trained=${result.trained} auc=${result.holdout_auc}`,
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

module.exports = {
  train,
  score,
  status,
  trainLogistic,
  metrics,
  predictProba,
  loadTrainingRows,
  splitHoldout,
  aucROC,
  MIN_POS,
  MIN_TOTAL,
  FEATURE_KEYS,
};
