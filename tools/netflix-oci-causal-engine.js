#!/usr/bin/env node
/**
 * tools/netflix-oci-causal-engine.js
 * 
 * Netflix OCI (Observational Causal Inference) Actor-Critic Causal Engine
 * Stolen from Netflix-Skunkworks/oci-agent & InfoQ August 2026.
 * 
 * Core Capabilities:
 * 1. Target Trial Emulation (TTE) Framework (Treatment, Outcome, Covariates, Placebo)
 * 2. Propensity Score Estimation & Inverse Probability Weighting (IPW)
 * 3. Covariate Balance & Standardized Mean Differences (SMD)
 * 4. Placebo Invariant Falsification Testing (Detects early-adopter & unmeasured bias)
 * 5. VanderWeele Sensitivity Bounds (E-value computation)
 * 6. Actor-Critic Refinement Loop (not_satisfactory, satisfactory_with_caveats, fully_satisfactory)
 * 7. Transparent Audit Receipts (ISO 42001 / JSON / Markdown)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const AUDIT_DIR = path.join(os.homedir(), '.hermes', 'causal-audits');

/**
 * Standard Sigmoid Function
 */
function sigmoid(z) {
  if (z < -40) return 0;
  if (z > 40) return 1;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Dot product
 */
function dotProduct(vecA, vecB) {
  let sum = 0;
  for (let i = 0; i < vecA.length; i++) {
    sum += vecA[i] * (vecB[i] || 0);
  }
  return sum;
}

/**
 * Compute Standardized Mean Difference (SMD)
 */
function computeSMD(treatedVals, controlVals, treatedWeights = null, controlWeights = null) {
  if (treatedVals.length === 0 || controlVals.length === 0) return 0;

  let meanT = 0;
  let meanC = 0;
  let sumWtT = 0;
  let sumWtC = 0;

  for (let i = 0; i < treatedVals.length; i++) {
    const w = treatedWeights ? treatedWeights[i] : 1;
    meanT += treatedVals[i] * w;
    sumWtT += w;
  }
  meanT = sumWtT > 0 ? meanT / sumWtT : 0;

  for (let i = 0; i < controlVals.length; i++) {
    const w = controlWeights ? controlWeights[i] : 1;
    meanC += controlVals[i] * w;
    sumWtC += w;
  }
  meanC = sumWtC > 0 ? meanC / sumWtC : 0;

  // Variances
  let varT = 0;
  let varC = 0;
  for (let i = 0; i < treatedVals.length; i++) {
    const diff = treatedVals[i] - meanT;
    const w = treatedWeights ? treatedWeights[i] : 1;
    varT += w * diff * diff;
  }
  varT = sumWtT > 1 ? varT / sumWtT : 1e-6;

  for (let i = 0; i < controlVals.length; i++) {
    const diff = controlVals[i] - meanC;
    const w = controlWeights ? controlWeights[i] : 1;
    varC += w * diff * diff;
  }
  varC = sumWtC > 1 ? varC / sumWtC : 1e-6;

  const pooledSD = Math.sqrt((varT + varC) / 2);
  if (pooledSD === 0) return 0;

  return Math.abs(meanT - meanC) / pooledSD;
}

/**
 * Estimate Propensity Scores using Logistic Regression (Gradient Descent)
 */
function fitPropensityScores(data, treatmentKey, covariateKeys, options = {}) {
  const learningRate = options.learningRate || 0.05;
  const epochs = options.epochs || 200;
  const l2 = options.l2 || 0.01;
  const trimDelta = options.trimDelta !== undefined ? options.trimDelta : 0.02;

  const numFeatures = covariateKeys.length;
  // Initialize weights [intercept, ...covariates]
  let weights = new Array(numFeatures + 1).fill(0);

  // Standardize covariates
  const means = [];
  const stds = [];
  for (let j = 0; j < numFeatures; j++) {
    const key = covariateKeys[j];
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += (data[i][key] || 0);
    }
    const mean = sum / data.length;
    let varSum = 0;
    for (let i = 0; i < data.length; i++) {
      const d = (data[i][key] || 0) - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / data.length) || 1;
    means.push(mean);
    stds.push(std);
  }

  // Feature matrix X: [1, (x_j - mean_j) / std_j]
  const X = data.map(row => {
    const rowVec = [1];
    for (let j = 0; j < numFeatures; j++) {
      const val = row[covariateKeys[j]] || 0;
      rowVec.push((val - means[j]) / stds[j]);
    }
    return rowVec;
  });

  const Y = data.map(row => (row[treatmentKey] ? 1 : 0));

  // Train via Gradient Descent
  for (let epoch = 0; epoch < epochs; epoch++) {
    const grads = new Array(numFeatures + 1).fill(0);
    for (let i = 0; i < data.length; i++) {
      const pred = sigmoid(dotProduct(weights, X[i]));
      const err = pred - Y[i];
      for (let j = 0; j <= numFeatures; j++) {
        grads[j] += err * X[i][j];
      }
    }
    for (let j = 0; j <= numFeatures; j++) {
      grads[j] = (grads[j] / data.length) + (j === 0 ? 0 : l2 * weights[j]);
      weights[j] -= learningRate * grads[j];
    }
  }

  // Predict propensity scores and assign IPW weights
  const propensityScores = [];
  const ipwWeights = [];

  for (let i = 0; i < data.length; i++) {
    let p = sigmoid(dotProduct(weights, X[i]));
    // Trim extreme tails
    if (p < trimDelta) p = trimDelta;
    if (p > 1 - trimDelta) p = 1 - trimDelta;
    propensityScores.push(p);

    const t = Y[i];
    const weight = t === 1 ? 1 / p : 1 / (1 - p);
    ipwWeights.push(weight);
  }

  return {
    weights,
    means,
    stds,
    propensityScores,
    ipwWeights,
  };
}

/**
 * Calculates VanderWeele & Ding E-value for sensitivity to unmeasured confounding.
 */
function computeEValue(riskRatio) {
  const num = Number(riskRatio) || 1.0;
  if (num <= 1.0) return 1.0;
  const rr = Math.max(1.0, num);
  const evalue = rr + Math.sqrt(rr * (rr - 1));
  return Number(evalue.toFixed(3));
}

/**
 * Execute Target Trial Emulation (TTE) Causal Estimation
 */
function estimateCausalEffect(dataset, spec, options = {}) {
  const {
    treatmentKey,
    outcomeKey,
    placeboKey,
    covariateKeys,
  } = spec;

  if (!dataset || dataset.length === 0) {
    throw new Error('Dataset must contain at least one observation.');
  }

  // 1. Fit Propensity Model
  const propFit = fitPropensityScores(dataset, treatmentKey, covariateKeys, options);

  // 2. Compute ATE (Average Treatment Effect) using IPW
  let treatedWeightedOutcome = 0;
  let treatedWeightSum = 0;
  let controlWeightedOutcome = 0;
  let controlWeightSum = 0;

  let rawTreatedOutcome = 0;
  let rawTreatedCount = 0;
  let rawControlOutcome = 0;
  let rawControlCount = 0;

  // Placebo accumulators
  let treatedWeightedPlacebo = 0;
  let controlWeightedPlacebo = 0;

  for (let i = 0; i < dataset.length; i++) {
    const row = dataset[i];
    const isTreated = Boolean(row[treatmentKey]);
    const outcome = Number(row[outcomeKey]) || 0;
    const placebo = placeboKey ? (Number(row[placeboKey]) || 0) : 0;
    const w = propFit.ipwWeights[i];

    if (isTreated) {
      treatedWeightedOutcome += outcome * w;
      treatedWeightSum += w;
      treatedWeightedPlacebo += placebo * w;

      rawTreatedOutcome += outcome;
      rawTreatedCount += 1;
    } else {
      controlWeightedOutcome += outcome * w;
      controlWeightSum += w;
      controlWeightedPlacebo += placebo * w;

      rawControlOutcome += outcome;
      rawControlCount += 1;
    }
  }

  const treatedMean = treatedWeightSum > 0 ? treatedWeightedOutcome / treatedWeightSum : 0;
  const controlMean = controlWeightSum > 0 ? controlWeightedOutcome / controlWeightSum : 0;
  const estimatedATE = Number((treatedMean - controlMean).toFixed(4));

  // Naive unadjusted difference
  const rawTreatedMean = rawTreatedCount > 0 ? rawTreatedOutcome / rawTreatedCount : 0;
  const rawControlMean = rawControlCount > 0 ? rawControlOutcome / rawControlCount : 0;
  const naiveDifference = Number((rawTreatedMean - rawControlMean).toFixed(4));

  // Placebo Effect (must be close to 0)
  const placeboTreatedMean = treatedWeightSum > 0 ? treatedWeightedPlacebo / treatedWeightSum : 0;
  const placeboControlMean = controlWeightSum > 0 ? controlWeightedPlacebo / controlWeightSum : 0;
  const estimatedPlaceboEffect = placeboKey 
    ? Number((placeboTreatedMean - placeboControlMean).toFixed(4))
    : 0.0;

  // 3. Compute Covariate Balances (SMD before & after)
  const covariateBalance = [];
  let maxWeightedSMD = 0;

  for (const covKey of covariateKeys) {
    const treatedVals = [];
    const controlVals = [];
    const treatedWeights = [];
    const controlWeights = [];

    for (let i = 0; i < dataset.length; i++) {
      const val = Number(dataset[i][covKey]) || 0;
      if (dataset[i][treatmentKey]) {
        treatedVals.push(val);
        treatedWeights.push(propFit.ipwWeights[i]);
      } else {
        controlVals.push(val);
        controlWeights.push(propFit.ipwWeights[i]);
      }
    }

    const unweightedSMD = Number(computeSMD(treatedVals, controlVals).toFixed(3));
    const weightedSMD = Number(computeSMD(treatedVals, controlVals, treatedWeights, controlWeights).toFixed(3));

    if (weightedSMD > maxWeightedSMD) maxWeightedSMD = weightedSMD;

    covariateBalance.push({
      covariate: covKey,
      unweightedSMD,
      weightedSMD,
      balanced: weightedSMD <= 0.10,
    });
  }

  // 4. Sensitivity Bounds (E-value)
  const riskRatio = controlMean !== 0 
    ? Math.abs(treatedMean / controlMean) 
    : (estimatedATE >= 0 ? 1 + estimatedATE : 1 / (1 + Math.abs(estimatedATE)));
  const evalue = computeEValue(riskRatio);

  return {
    sampleSize: dataset.length,
    treatmentCount: rawTreatedCount,
    controlCount: rawControlCount,
    estimatedATE,
    naiveDifference,
    overestimateRatio: naiveDifference !== 0 ? Number((naiveDifference / (estimatedATE || 1e-4)).toFixed(2)) : 1.0,
    placeboEffect: estimatedPlaceboEffect,
    maxWeightedSMD,
    covariateBalance,
    riskRatio: Number(riskRatio.toFixed(3)),
    evalue,
    weights: propFit.weights,
  };
}

/**
 * Critic Agent Evaluation & Playbook Recommendation
 */
function criticAudit(estimationResult, spec) {
  const {
    estimatedATE,
    placeboEffect,
    maxWeightedSMD,
    evalue,
  } = estimationResult;

  const placeboTolerance = spec.placeboTolerance !== undefined ? spec.placeboTolerance : 0.05;
  const smdTolerance = spec.smdTolerance !== undefined ? spec.smdTolerance : 0.10;
  const minEValue = spec.minEValue !== undefined ? spec.minEValue : 1.5;

  const issues = [];
  const playbooks = [];

  // Check 1: Placebo Invariant Test
  const placeboPassed = Math.abs(placeboEffect) <= placeboTolerance;
  if (!placeboPassed) {
    issues.push(`Failed Placebo Test: Placebo effect ${placeboEffect} exceeds tolerance (${placeboTolerance}). Early-adopter or confounding bias present.`);
    playbooks.push('ADD_CALENDAR_SEASONALITY_CONTROLS', 'TRIM_EXTREME_PROPENSITY_TAILS');
  }

  // Check 2: Covariate Imbalance
  const balancePassed = maxWeightedSMD <= smdTolerance;
  if (!balancePassed) {
    issues.push(`Covariate Imbalance: Max weighted SMD (${maxWeightedSMD}) exceeds standard balance threshold (${smdTolerance}).`);
    playbooks.push('ADD_COVARIATE_INTERACTIONS', 'INCREASE_PROPENSITY_L2_REGULARIZATION');
  }

  // Check 3: Sensitivity / E-value
  const sensitivityPassed = evalue >= minEValue;
  if (!sensitivityPassed) {
    issues.push(`Low Robustness (E-value ${evalue} < ${minEValue}): Observed effect can be nullified by modest unmeasured confounding.`);
    playbooks.push('EXPAND_OBSERVATIONAL_WINDOW', 'BOUND_CONFIDENCE_INTERVALS');
  }

  // Assign 3-tier rating
  let rating = 'fully_satisfactory';
  if (!placeboPassed || maxWeightedSMD > 0.20) {
    rating = 'not_satisfactory';
  } else if (!balancePassed || !sensitivityPassed) {
    rating = 'satisfactory_with_caveats';
  }

  return {
    rating,
    placeboPassed,
    balancePassed,
    sensitivityPassed,
    issues,
    recommendedPlaybooks: [...new Set(playbooks)],
  };
}

/**
 * Actor-Critic Autonomous Refinement Loop
 */
function runActorCriticCausalLoop(dataset, initialSpec, options = {}) {
  const maxIterations = options.maxIterations || 3;
  let currentSpec = { ...initialSpec };
  let currentOptions = { ...options };

  const history = [];
  let finalResult = null;
  let finalCritic = null;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // 1. Actor executes estimation
    const estimation = estimateCausalEffect(dataset, currentSpec, currentOptions);

    // 2. Critic audits result
    const critic = criticAudit(estimation, currentSpec);

    history.push({
      iteration,
      spec: { ...currentSpec },
      rating: critic.rating,
      estimatedATE: estimation.estimatedATE,
      placeboEffect: estimation.placeboEffect,
      maxWeightedSMD: estimation.maxWeightedSMD,
      evalue: estimation.evalue,
      issues: critic.issues,
      recommendedPlaybooks: critic.recommendedPlaybooks,
    });

    finalResult = estimation;
    finalCritic = critic;

    if (critic.rating === 'fully_satisfactory') {
      break;
    }

    // Apply Critic Playbooks for next iteration
    if (critic.recommendedPlaybooks.includes('TRIM_EXTREME_PROPENSITY_TAILS')) {
      currentOptions.trimDelta = (currentOptions.trimDelta || 0.02) + 0.03;
    }
    if (critic.recommendedPlaybooks.includes('INCREASE_PROPENSITY_L2_REGULARIZATION')) {
      currentOptions.l2 = (currentOptions.l2 || 0.01) * 2;
    }
    if (critic.recommendedPlaybooks.includes('ADD_COVARIATE_INTERACTIONS') && currentSpec.covariateKeys.length >= 2) {
      currentOptions.epochs = (currentOptions.epochs || 200) + 100;
      currentOptions.learningRate = (currentOptions.learningRate || 0.05) * 0.8;
    }
  }

  const receiptId = `audit_${crypto.randomUUID().slice(0, 12)}`;
  const auditReceipt = {
    receiptId,
    timestamp: new Date().toISOString(),
    iterationsCount: history.length,
    finalRating: finalCritic.rating,
    finalEstimate: {
      estimatedATE: finalResult.estimatedATE,
      naiveDifference: finalResult.naiveDifference,
      overestimateRatio: finalResult.overestimateRatio,
      placeboEffect: finalResult.placeboEffect,
      evalue: finalResult.evalue,
      maxWeightedSMD: finalResult.maxWeightedSMD,
    },
    covariateBalance: finalResult.covariateBalance,
    history,
  };

  // Save audit receipt locally
  try {
    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true });
    }
    fs.writeFileSync(
      path.join(AUDIT_DIR, `${receiptId}.json`),
      JSON.stringify(auditReceipt, null, 2),
      'utf8'
    );
  } catch (_err) {
    // Ignore FS errors in constrained environments
  }

  return {
    receiptId,
    estimation: finalResult,
    critic: finalCritic,
    history,
    receipt: auditReceipt,
  };
}

/**
 * Generates synthetic observational dataset for testing & demonstrations
 */
function generateSyntheticObservationalData(n = 500) {
  const data = [];
  for (let i = 0; i < n; i++) {
    // Confounder: User baseline activity & engagement
    const baselineActivity = Math.random() * 10;
    const accountAgeDays = Math.floor(Math.random() * 365) + 30;
    
    // Confounded treatment assignment (more active users adopt new feature)
    const logit = -1.5 + 0.3 * baselineActivity + 0.002 * accountAgeDays;
    const probTreatment = sigmoid(logit);
    const treated = Math.random() < probTreatment ? 1 : 0;

    // True causal effect of feature = +1.2 units of 60-day retention
    // Baseline outcome also heavily depends on baselineActivity (3.0 * baselineActivity)
    const noise = (Math.random() - 0.5) * 2;
    const outcome = 10 + (treated ? 1.2 : 0) + 2.5 * baselineActivity + 0.01 * accountAgeDays + noise;

    // Placebo outcome (measured BEFORE treatment; cannot causally depend on treated)
    const placebo = 5 + 2.0 * baselineActivity + (Math.random() - 0.5) * 1.5;

    data.push({
      id: `usr_${i + 1}`,
      treated,
      outcome: Number(outcome.toFixed(2)),
      placebo: Number(placebo.toFixed(2)),
      baselineActivity: Number(baselineActivity.toFixed(2)),
      accountAgeDays,
    });
  }
  return data;
}

/**
 * Format Human-Readable Markdown Audit Report
 */
function formatMarkdownReport(result) {
  const { receiptId, estimation, critic, history } = result;
  return `
# 🔬 Netflix OCI Causal Inference Audit Report

**Audit Receipt ID:** \`${receiptId}\`  
**Critic Final Rating:** **\`${critic.rating.toUpperCase()}\`**  
**Iterations:** ${history.length}

---

## 📊 Causal Effect vs. Naive Baseline

| Metric | Value | Meaning |
| :--- | :--- | :--- |
| **Causal ATE (IPW)** | **${estimation.estimatedATE > 0 ? '+' : ''}${estimation.estimatedATE}** | True isolated treatment effect |
| **Naive Baseline Diff** | **${estimation.naiveDifference > 0 ? '+' : ''}${estimation.naiveDifference}** | Unadjusted raw comparison |
| **Naive Overestimate** | **${estimation.overestimateRatio}x** | Confounding inflation detected |
| **Placebo Invariant** | **${estimation.placeboEffect}** | Effect on pre-treatment baseline (${critic.placeboPassed ? '✅ PASS' : '❌ FAIL'}) |
| **E-value Robustness** | **${estimation.evalue}** | VanderWeele sensitivity bound (${critic.sensitivityPassed ? '✅ ROBUST' : '⚠️ FRAGILE'}) |

---

## ⚖️ Covariate Balance (Standardized Mean Differences)

| Covariate | Unweighted SMD | Weighted SMD | Balance Status |
| :--- | :--- | :--- | :--- |
${estimation.covariateBalance.map(c => `| \`${c.covariate}\` | ${c.unweightedSMD} | **${c.weightedSMD}** | ${c.balanced ? '✅ Balanced (≤0.10)' : '⚠️ Imbalanced'} |`).join('\n')}

---

## 🛡️ Critic Audit & Playbook Diagnostic

- **Rating:** \`${critic.rating}\`
- **Placebo Test:** ${critic.placeboPassed ? 'Passed' : 'Failed'}
- **Covariate Balance:** ${critic.balancePassed ? 'Passed' : 'Failed'}
- **Issues Detected:** ${critic.issues.length > 0 ? critic.issues.join('; ') : 'None (Strict Invariants Met)'}
- **Recommended Playbooks:** ${critic.recommendedPlaybooks.length > 0 ? critic.recommendedPlaybooks.map(p => `\`${p}\``).join(', ') : 'None required'}
`;
}

module.exports = {
  sigmoid,
  computeSMD,
  computeEValue,
  fitPropensityScores,
  estimateCausalEffect,
  criticAudit,
  runActorCriticCausalLoop,
  generateSyntheticObservationalData,
  formatMarkdownReport,
};

// CLI Execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const isDryRun = args.includes('--dry-run');

  const dataset = generateSyntheticObservationalData(600);
  const spec = {
    treatmentKey: 'treated',
    outcomeKey: 'outcome',
    placeboKey: 'placebo',
    covariateKeys: ['baselineActivity', 'accountAgeDays'],
    placeboTolerance: 0.15,
    smdTolerance: 0.10,
    minEValue: 1.5,
  };

  const result = runActorCriticCausalLoop(dataset, spec, { maxIterations: 3 });

  if (isJson) {
    console.log(JSON.stringify(result.receipt, null, 2));
  } else {
    console.log(formatMarkdownReport(result));
  }
}
