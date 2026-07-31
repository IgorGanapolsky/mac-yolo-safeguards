#!/usr/bin/env node
'use strict';

/**
 * ml-core.js — shared July 2026 ML primitives (pure JS, no sklearn/torch).
 * Metrics, logistic training, calibration helpers used by train/serve/gate.
 */

function sigmoid(z) {
  const x = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-x));
}

function predictProba(model, x) {
  const z = model.bias + model.weights.reduce((s, wi, i) => s + wi * (x[i] || 0), 0);
  let p = sigmoid(z);
  // Optional Platt calibration: p' = sigmoid(a * logit(p) + b)
  if (model.calibration && model.calibration.fitted) {
    const pp = Math.min(1 - 1e-9, Math.max(1e-9, p));
    const logit = Math.log(pp / (1 - pp));
    p = sigmoid(model.calibration.a * logit + model.calibration.b);
  }
  return p;
}

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

function confusionAt(scores, threshold) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const s of scores) {
    const yhat = s.p >= threshold ? 1 : 0;
    if (yhat === 1 && s.y === 1) tp += 1;
    else if (yhat === 1 && s.y === 0) fp += 1;
    else if (yhat === 0 && s.y === 0) tn += 1;
    else fn += 1;
  }
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 =
    precision != null && recall != null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  return {
    threshold,
    tp,
    fp,
    tn,
    fn,
    precision: precision == null ? null : Number(precision.toFixed(4)),
    recall: recall == null ? null : Number(recall.toFixed(4)),
    f1: f1 == null ? null : Number(f1.toFixed(4)),
  };
}

function metrics(model, rows, threshold = 0.5) {
  if (!rows.length) {
    return {
      n: 0,
      accuracy: null,
      auc: null,
      logloss: null,
      brier: null,
      pos: 0,
      neg: 0,
      at_threshold: null,
    };
  }
  let correct = 0;
  let logloss = 0;
  let brier = 0;
  const scores = [];
  let pos = 0;
  let neg = 0;
  for (const row of rows) {
    const p = predictProba(model, row.x);
    const yhat = p >= threshold ? 1 : 0;
    if (yhat === row.label_paid) correct += 1;
    const pp = Math.min(1 - 1e-9, Math.max(1e-9, p));
    logloss += -(row.label_paid * Math.log(pp) + (1 - row.label_paid) * Math.log(1 - pp));
    brier += (p - row.label_paid) ** 2;
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
    brier: Number((brier / rows.length).toFixed(4)),
    auc: aucROC(scores),
    at_threshold: confusionAt(scores, threshold),
  };
}

function trainLogistic(trainRows, { dim, lr = 0.35, epochs = 400, l2 = 0.02 } = {}) {
  const w = new Array(dim).fill(0);
  let b = 0;
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = new Array(dim).fill(0);
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
      gradW[i] = gradW[i] / n + l2 * w[i];
      w[i] -= lr * gradW[i];
    }
    b -= lr * (gradB / n);
  }
  return { weights: w, bias: b };
}

/**
 * Fit simple Platt scaling on holdout predictions: p' = σ(a * logit(p) + b)
 */
function fitPlatt(model, rows) {
  if (!rows || rows.length < 4) {
    return { fitted: false, a: 1, b: 0, reason: 'need >=4 holdout rows' };
  }
  const samples = rows.map((r) => {
    const p = predictProba({ ...model, calibration: null }, r.x);
    const pp = Math.min(1 - 1e-9, Math.max(1e-9, p));
    return { logit: Math.log(pp / (1 - pp)), y: r.label_paid };
  });
  // 1D logistic on logit features
  let a = 1;
  let b = 0;
  const lr = 0.1;
  for (let epoch = 0; epoch < 200; epoch += 1) {
    let ga = 0;
    let gb = 0;
    for (const s of samples) {
      const p = sigmoid(a * s.logit + b);
      const err = p - s.y;
      ga += err * s.logit;
      gb += err;
    }
    const n = samples.length;
    a -= lr * (ga / n);
    b -= lr * (gb / n);
  }
  return { fitted: true, a: Number(a.toFixed(6)), b: Number(b.toFixed(6)) };
}

function kFoldSplits(rows, k = 5) {
  const sorted = [...rows];
  // stratified-ish: shuffle by id hash for determinism
  sorted.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const folds = Array.from({ length: k }, () => []);
  sorted.forEach((row, i) => {
    folds[i % k].push(row);
  });
  return folds;
}

function crossValidate(rows, dim, k = 5) {
  if (rows.length < k * 2) {
    return { k, folds: [], mean_auc: null, mean_brier: null, mean_logloss: null };
  }
  const folds = kFoldSplits(rows, k);
  const foldMetrics = [];
  for (let i = 0; i < k; i += 1) {
    const hold = folds[i];
    const train = folds.filter((_, j) => j !== i).flat();
    if (!train.length || !hold.length) continue;
    const fit = trainLogistic(train, { dim });
    foldMetrics.push(metrics(fit, hold));
  }
  const mean = (key) => {
    const vals = foldMetrics.map((m) => m[key]).filter((v) => typeof v === 'number');
    if (!vals.length) return null;
    return Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(4));
  };
  return {
    k,
    folds: foldMetrics,
    mean_auc: mean('auc'),
    mean_brier: mean('brier'),
    mean_logloss: mean('logloss'),
    mean_accuracy: mean('accuracy'),
  };
}

function featureImportance(weights, featureKeys) {
  const abs = weights.map((w, i) => ({ feature: featureKeys[i], weight: w, abs: Math.abs(w) }));
  abs.sort((a, b) => b.abs - a.abs);
  return abs.map(({ feature, weight }) => ({
    feature,
    weight: Number(weight.toFixed(6)),
  }));
}

/** nDCG@k for ranked retrieval with binary per-path relevance (capped ≤ 1). */
function ndcgAtK(rankedPaths, relevantSubstrings, k) {
  const rel = (path) =>
    relevantSubstrings.some((sub) => path.includes(sub) || path.replace(/\\/g, '/').includes(sub))
      ? 1
      : 0;
  const top = rankedPaths.slice(0, k);
  const pathRel = top.map(rel);
  const dcg = pathRel.reduce((s, r, i) => s + r / Math.log2(i + 2), 0);
  // Ideal: all relevant docs first. Count = min(k, relevant hits in top-k list)
  // so multiple matches for one substring don't invent nDCG > 1.
  const idealCount = Math.min(k, pathRel.reduce((s, r) => s + r, 0) || relevantSubstrings.length);
  let idcg = 0;
  for (let i = 0; i < idealCount; i += 1) idcg += 1 / Math.log2(i + 2);
  if (idcg === 0) return pathRel.some(Boolean) ? 1 : 0;
  return Number(Math.min(1, dcg / idcg).toFixed(4));
}

/**
 * Chi-square two-proportion test for A/B conversion rates.
 * Returns { significant, pApprox, z } — pApprox via normal tail (good enough for gate).
 */
function twoProportionTest(successA, nA, successB, nB) {
  if (nA < 1 || nB < 1) {
    return { significant: false, z: null, pApprox: null, reason: 'empty arm' };
  }
  const p1 = successA / nA;
  const p2 = successB / nB;
  const p = (successA + successB) / (nA + nB);
  const se = Math.sqrt(p * (1 - p) * (1 / nA + 1 / nB));
  if (se === 0) {
    return { significant: false, z: 0, pApprox: 1, reason: 'zero variance' };
  }
  const z = (p1 - p2) / se;
  // two-sided normal approx
  const absZ = Math.abs(z);
  // crude erfc-based p
  const pApprox = Number((2 * (1 - normalCdf(absZ))).toFixed(4));
  return {
    significant: absZ >= 1.96, // ~p<0.05
    z: Number(z.toFixed(4)),
    pApprox,
    p1: Number(p1.toFixed(4)),
    p2: Number(p2.toFixed(4)),
    lift: p2 === 0 ? null : Number(((p1 - p2) / p2).toFixed(4)),
  };
}

function normalCdf(x) {
  // Abramowitz & Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

module.exports = {
  sigmoid,
  predictProba,
  aucROC,
  metrics,
  confusionAt,
  trainLogistic,
  fitPlatt,
  crossValidate,
  featureImportance,
  ndcgAtK,
  twoProportionTest,
  normalCdf,
};
