'use strict';

const assert = require('assert');
const path = require('path');
const {
  DEFAULT_PANEL_PATH,
  SCHEMA_VERSION,
  TRAFFIC_SPLIT,
  chooseAction,
  formatText,
  ingestObservations,
  loadPanel,
  runPanel,
  scorePersonaVariant,
  validatePanel,
} = require('../tools/synthetic-customer-panel');

console.log('=== test-synthetic-customer-panel ===');

const panel = loadPanel(DEFAULT_PANEL_PATH);
const validation = validatePanel(panel);
assert.strictEqual(validation.ok, true, JSON.stringify(validation.issues));
assert.ok(panel.personas.length >= 10, 'need 10 personas');
assert.strictEqual(panel.variants.length, 3);
assert.strictEqual(panel.decision.outcomeMetric, 'qualified_hosted_vps_send');
assert.notStrictEqual(panel.decision.outcomeMetric, 'simulate_everyone');

const result = runPanel(panel);
assert.strictEqual(result.schemaVersion, SCHEMA_VERSION);
assert.strictEqual(result.runDecision, 'allow');
assert.strictEqual(result.deploymentDecision, 'deny');
assert.strictEqual(result.modeledNotMeasured, true);
assert.strictEqual(result.evaluation.evidenceGrade, 'modeledNotMeasured');
assert.strictEqual(result.evaluation.livePromotionAllowed, false);
assert.strictEqual(result.evaluation.observedCount, 0);
assert.ok(result.evaluation.holdoutPairs >= 5, `holdout pairs ${result.evaluation.holdoutPairs}`);
assert.strictEqual(result.fineTune.allowed, false);
assert.strictEqual(result.ranked[0].variantId, 'composer-reachable');
assert.strictEqual(result.ranked[0].modeledNotMeasured, true);
assert.ok(result.ranked[0].meanScore > result.ranked.find((row) => row.variantId === 'clip-cta').meanScore);
assert.ok(result.recommendation.hypothesis.includes('composer-reachable'));
assert.ok(result.recommendation.hypothesis.includes('predicted'));
assert.ok(result.recommendation.hypothesis.includes('10–20%') || result.recommendation.hypothesis.includes('10-20%'));
assert.strictEqual(result.recommendation.challenger, 'clip-cta');
assert.ok(result.recommendation.hypothesis.includes('clip-cta'));
assert.ok(!result.recommendation.liveExperiment.variants.includes('continuity-picker'));
assert.doesNotMatch(result.recommendation.hypothesis, /the agents say/i);
assert.doesNotMatch(result.recommendation.hypothesis, /wins\b/i);
assert.ok(result.recommendation.claimBoundary.includes('not observed conversion lift'));
assert.strictEqual(result.recommendation.liveExperiment.status, 'recommended_not_launched');
assert.strictEqual(result.recommendation.liveExperiment.trafficSplit.min, TRAFFIC_SPLIT.min);

const phone = panel.personas.find((row) => row.id === 'p-phone-no-composer');
const clip = panel.variants.find((row) => row.id === 'clip-cta');
const reachable = panel.variants.find((row) => row.id === 'composer-reachable');
assert.ok(scorePersonaVariant(phone, reachable, 'thread_synced') > scorePersonaVariant(phone, clip, 'thread_synced'));
assert.strictEqual(chooseAction(0.2, phone, clip), 'bounce');

const text = formatText(result);
assert.doesNotMatch(text, /the agents say/i);
assert.match(text, /modeledNotMeasured/);
assert.match(text, /deploy: deny/);

assert.throws(
  () => ingestObservations([{ personaId: 'p-phone-no-composer', variantId: 'clip-cta', outcome: 1, kind: 'guess' }]),
  /refusing/,
);

const withObserved = runPanel(panel, {
  observations: panel.observations.map((row) => ({ ...row, kind: 'observed' })),
  allowFixture: false,
});
assert.strictEqual(withObserved.evaluation.observedCount, panel.observations.length);
assert.ok(withObserved.evaluation.holdoutPairs >= 5);
assert.ok(withObserved.evaluation.holdoutPairwiseAccuracy >= 0.7, String(withObserved.evaluation.holdoutPairwiseAccuracy));
assert.strictEqual(withObserved.evaluation.livePromotionAllowed, true);
assert.strictEqual(withObserved.deploymentDecision, 'allow');
assert.match(withObserved.recommendation.claimBoundary, /not observed conversion lift/);

const missing = validatePanel({ ...panel, personas: panel.personas.slice(0, 2) });
assert.strictEqual(missing.ok, false);
assert.ok(missing.issues.includes('insufficient_personas'));

assert.ok(path.basename(DEFAULT_PANEL_PATH) === 'panel.json');
console.log(`ok ranking=${result.ranked.map((row) => row.variantId).join('>')} holdoutPairs=${result.evaluation.holdoutPairs} modeledNotMeasured`);
console.log('=== test-synthetic-customer-panel PASS ===');
