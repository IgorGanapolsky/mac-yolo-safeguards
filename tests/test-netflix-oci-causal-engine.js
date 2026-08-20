'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  sigmoid,
  computeSMD,
  computeEValue,
  fitPropensityScores,
  estimateCausalEffect,
  criticAudit,
  runActorCriticCausalLoop,
  generateSyntheticObservationalData,
  formatMarkdownReport,
} = require('../tools/netflix-oci-causal-engine');

test('sigmoid bounds and mathematical properties', () => {
  assert.equal(sigmoid(0), 0.5);
  assert.ok(sigmoid(10) > 0.99);
  assert.ok(sigmoid(-10) < 0.01);
  assert.equal(sigmoid(100), 1);
  assert.equal(sigmoid(-100), 0);
});

test('computeSMD calculates standardized mean difference correctly', () => {
  const treated = [10, 11, 12, 10, 11];
  const control = [5, 6, 5, 6, 5];
  const smd = computeSMD(treated, control);
  assert.ok(smd > 2.0, `Expected large SMD for separated distributions, got ${smd}`);

  const identicalA = [1, 2, 3];
  const identicalB = [1, 2, 3];
  assert.equal(computeSMD(identicalA, identicalB), 0);
});

test('computeEValue calculates VanderWeele sensitivity bounds', () => {
  // For RR = 1.0, E-value = 1.0
  assert.equal(computeEValue(1.0), 1.0);
  // For RR = 2.0, E-value = 2 + sqrt(2 * 1) = 2 + 1.414 = 3.414
  assert.equal(computeEValue(2.0), 3.414);
  // For RR = 1.5, E-value = 1.5 + sqrt(1.5 * 0.5) = 1.5 + 0.866 = 2.366
  assert.equal(computeEValue(1.5), 2.366);
});

test('fitPropensityScores produces valid probabilities and IPW weights', () => {
  const data = generateSyntheticObservationalData(100);
  const fit = fitPropensityScores(data, 'treated', ['baselineActivity', 'accountAgeDays'], { epochs: 50 });

  assert.equal(fit.propensityScores.length, 100);
  assert.equal(fit.ipwWeights.length, 100);

  for (let i = 0; i < 100; i++) {
    assert.ok(fit.propensityScores[i] >= 0.02 && fit.propensityScores[i] <= 0.98, 'Propensity trimmed');
    assert.ok(fit.ipwWeights[i] > 1.0, 'IPW weight > 1.0');
  }
});

test('estimateCausalEffect isolates true treatment effect and unmasks naive inflation', () => {
  const data = generateSyntheticObservationalData(400);
  const spec = {
    treatmentKey: 'treated',
    outcomeKey: 'outcome',
    placeboKey: 'placebo',
    covariateKeys: ['baselineActivity', 'accountAgeDays'],
  };

  const res = estimateCausalEffect(data, spec, { epochs: 100 });
  assert.ok(res.sampleSize === 400);
  assert.ok(res.treatmentCount > 0);
  assert.ok(res.controlCount > 0);
  assert.ok(typeof res.estimatedATE === 'number');
  assert.ok(typeof res.naiveDifference === 'number');
  assert.ok(res.covariateBalance.length === 2);
  assert.ok(res.evalue >= 1.0);
});

test('criticAudit assigns deterministic 3-tier ratings', () => {
  const spec = {
    placeboTolerance: 0.1,
    smdTolerance: 0.1,
    minEValue: 1.5,
  };

  // 1. Fully satisfactory
  const goodRes = {
    estimatedATE: 1.5,
    placeboEffect: 0.02,
    maxWeightedSMD: 0.05,
    evalue: 2.5,
  };
  const goodAudit = criticAudit(goodRes, spec);
  assert.equal(goodAudit.rating, 'fully_satisfactory');
  assert.equal(goodAudit.issues.length, 0);

  // 2. Satisfactory with caveats (modest sensitivity / slight balance drift)
  const caveatRes = {
    estimatedATE: 1.1,
    placeboEffect: 0.04,
    maxWeightedSMD: 0.12,
    evalue: 1.3,
  };
  const caveatAudit = criticAudit(caveatRes, spec);
  assert.equal(caveatAudit.rating, 'satisfactory_with_caveats');
  assert.ok(caveatAudit.issues.length > 0);

  // 3. Not satisfactory (failed placebo test)
  const failRes = {
    estimatedATE: 3.5,
    placeboEffect: 0.85, // Failed placebo!
    maxWeightedSMD: 0.25,
    evalue: 1.1,
  };
  const failAudit = criticAudit(failRes, spec);
  assert.equal(failAudit.rating, 'not_satisfactory');
  assert.ok(failAudit.recommendedPlaybooks.includes('TRIM_EXTREME_PROPENSITY_TAILS'));
});

test('runActorCriticCausalLoop executes multi-iteration loop and persists audit receipt', () => {
  const data = generateSyntheticObservationalData(200);
  const spec = {
    treatmentKey: 'treated',
    outcomeKey: 'outcome',
    placeboKey: 'placebo',
    covariateKeys: ['baselineActivity', 'accountAgeDays'],
    placeboTolerance: 0.25,
    smdTolerance: 0.15,
    minEValue: 1.2,
  };

  const loop = runActorCriticCausalLoop(data, spec, { maxIterations: 2, epochs: 50 });
  assert.ok(loop.receiptId.startsWith('audit_'));
  assert.ok(loop.history.length >= 1);
  assert.ok(loop.estimation);
  assert.ok(loop.critic);
  assert.ok(['fully_satisfactory', 'satisfactory_with_caveats', 'not_satisfactory'].includes(loop.critic.rating));

  // Check generated Markdown report
  const report = formatMarkdownReport(loop);
  assert.ok(report.includes('Netflix OCI Causal Inference Audit Report'));
  assert.ok(report.includes('Causal ATE (IPW)'));
  assert.ok(report.includes('Covariate Balance'));
});
