#!/usr/bin/env node
'use strict';

/**
 * ml-propensity-train.js — pure-JS logistic propensity with July 2026 metrics.
 *
 * Fail-closed when labels are insufficient:
 *   positives < MIN_POS or total < MIN_TOTAL → insufficient_labels (no fake AUC).
 *
 * Trained models get:
 *   - time-based holdout metrics (AUC, Brier, logloss, precision/recall/F1)
 *   - k-fold CV means
 *   - Platt calibration on holdout
 *   - feature importance from |weights|
 *   - optional auto-register into ml-registry
 *
 *   node tools/ml-propensity-train.js train [--labels PATH] [--register] [--json]
 *   node tools/ml-propensity-train.js score --features '{...}' [--json]
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
const {
  predictProba,
  metrics,
  trainLogistic,
  fitPlatt,
  crossValidate,
  featureImportance,
} = require('./ml-core');

const DEFAULT_ML_DIR = path.join(os.homedir(), '.hermes', 'ml');
const DEFAULT_LABELS = path.join(DEFAULT_ML_DIR, 'labels.jsonl');
const DEFAULT_MODEL = path.join(DEFAULT_ML_DIR, 'propensity-model.json');

const MIN_POS = 5;
const MIN_TOTAL = 20;
const HOLDOUT_FRAC = 0.2;
const LR = 0.35;
const EPOCHS = 400;
const L2 = 0.02;
const CV_K = 5;

function parseArgs(argv) {
  const args = {
    command: 'status',
    json: false,
    help: false,
    labels: DEFAULT_LABELS,
    modelOut: DEFAULT_MODEL,
    features: '',
    force: false,
    register: false,
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
    else if (a === '--register') args.register = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
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
    fs.mkdirSync(path.dirname(args.modelOut), { recursive: true });
    fs.writeFileSync(
      args.modelOut,
      JSON.stringify(
        {
          schema_version: 'ml-propensity-model/2',
          status: 'insufficient_labels',
          trained: false,
          positives,
          negatives,
          total: rows.length,
          feature_keys: FEATURE_KEYS,
          generated_at: new Date().toISOString(),
          note: report.message,
          july_2026: {
            requires: 'holdout+cv+brier+calibration when trained',
            production_claim: 'forbidden until trained=true and registry promote',
          },
        },
        null,
        2,
      ) + '\n',
      { encoding: 'utf8', mode: 0o600 },
    );
    return report;
  }

  const { train: trainRows, holdout } = splitHoldout(rows);
  const dim = FEATURE_KEYS.length;
  const fit = trainLogistic(trainRows, { dim, lr: LR, epochs: EPOCHS, l2: L2 });
  const calibration = fitPlatt(fit, holdout.length ? holdout : trainRows);
  const calibrated = { ...fit, calibration };
  const trainMetrics = metrics(calibrated, trainRows);
  const holdoutMetrics = metrics(calibrated, holdout.length ? holdout : trainRows);
  const cv = crossValidate(rows, dim, Math.min(CV_K, Math.floor(rows.length / 4) || 2));
  const importance = featureImportance(fit.weights, FEATURE_KEYS);

  const model = {
    schema_version: 'ml-propensity-model/2',
    status: 'trained',
    trained: true,
    feature_keys: FEATURE_KEYS,
    weights: fit.weights.map((w) => Number(w.toFixed(6))),
    bias: Number(fit.bias.toFixed(6)),
    calibration,
    hyperparameters: {
      lr: LR,
      epochs: EPOCHS,
      l2: L2,
      holdout_frac: HOLDOUT_FRAC,
      cv_k: cv.k,
    },
    train_metrics: trainMetrics,
    holdout_metrics: holdoutMetrics,
    cv,
    feature_importance: importance,
    positives,
    negatives,
    total: rows.length,
    generated_at: new Date().toISOString(),
    labels_path: args.labels,
    july_2026: {
      metrics: ['auc', 'brier', 'logloss', 'precision', 'recall', 'f1', 'cv_mean_auc'],
      calibration: calibration.fitted ? 'platt_holdout' : 'none',
      production_claim: 'allowed after registry promote with holdout_auc reported',
    },
  };
  fs.mkdirSync(path.dirname(args.modelOut), { recursive: true });
  fs.writeFileSync(args.modelOut, JSON.stringify(model, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });

  let registry = null;
  if (args.register) {
    try {
      const reg = require('./ml-registry');
      registry = reg.register({ model: args.modelOut, name: 'propensity', json: true });
    } catch (error) {
      registry = { ok: false, error: error.message || String(error) };
    }
  }

  return {
    ok: true,
    status: 'trained',
    trained: true,
    model_path: args.modelOut,
    train_metrics: trainMetrics,
    holdout_metrics: holdoutMetrics,
    cv,
    feature_importance: importance.slice(0, 5),
    calibration,
    positives,
    negatives,
    total: rows.length,
    registry,
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
  const fmap =
    features.agent_stack !== undefined && features.segment_agency === undefined
      ? featureVectorFromProspect(features)
      : features;
  const x = featuresToArray(fmap);
  const p = predictProba(
    {
      weights: model.weights,
      bias: model.bias,
      calibration: model.calibration,
    },
    x,
  );
  return {
    ok: true,
    probability_paid: Number(p.toFixed(4)),
    decision: p >= 0.5 ? 'high_propensity' : 'low_propensity',
    calibrated: Boolean(model.calibration?.fitted),
    features: fmap,
    model_generated_at: model.generated_at,
    holdout_auc: model.holdout_metrics?.auc ?? null,
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
    holdout_brier: model?.holdout_metrics?.brier ?? null,
    cv_mean_auc: model?.cv?.mean_auc ?? null,
    calibrated: Boolean(model?.calibration?.fitted),
    positives: model?.positives ?? null,
    total: model?.total ?? null,
    schema_version: model?.schema_version ?? null,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/ml-propensity-train.js train [--labels PATH] [--register] [--json]
  node tools/ml-propensity-train.js score --features '{...}' [--json]
  node tools/ml-propensity-train.js status [--json]`);
    process.exit(0);
  }
  let result;
  if (args.command === 'train') result = train(args);
  else if (args.command === 'score') result = score(args);
  else if (args.command === 'status') result = status(args);
  else throw new Error(`Unknown command: ${args.command}`);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (args.command === 'train') {
    if (result.trained) {
      console.log(
        `ml-propensity: trained pos=${result.positives}/${result.total} ` +
          `holdout_auc=${result.holdout_metrics?.auc} brier=${result.holdout_metrics?.brier} ` +
          `cv_auc=${result.cv?.mean_auc} → ${result.model_path}`,
      );
    } else {
      console.log(`ml-propensity: ${result.status} — ${result.message}`);
    }
  } else if (args.command === 'score') {
    if (!result.ok) {
      console.log(`ml-propensity score: ${result.status}`);
    } else {
      console.log(
        `ml-propensity score: p_paid=${result.probability_paid} (${result.decision}) calibrated=${result.calibrated}`,
      );
    }
  } else {
    console.log(
      `ml-propensity status: ${result.status} trained=${result.trained} auc=${result.holdout_auc} cv=${result.cv_mean_auc}`,
    );
  }

  // Fail-closed exit codes even in --json mode (obsessive verification contract).
  if (args.command === 'train' && !result.trained) process.exitCode = 2;
  if (args.command === 'score' && result.ok === false) process.exitCode = 2;
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
  loadTrainingRows,
  splitHoldout,
  MIN_POS,
  MIN_TOTAL,
  FEATURE_KEYS,
  // re-export for tests that imported from here
  trainLogistic: (rows) => trainLogistic(rows, { dim: FEATURE_KEYS.length }),
  metrics: (model, rows) => metrics(model, rows),
  predictProba,
  aucROC: require('./ml-core').aucROC,
};
