#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  getObservabilityAndAnalytics,
  getVersioningState,
  evaluateFlagsAndCheckoutAbTest,
  auditTagsAndLabels,
  auditRollbackHotfixAndCd,
  runAllTenProductionPillars,
} = require('../tools/mac-yolo-release-cd-engine');

function main() {
  const oa = getObservabilityAndAnalytics();
  assert.strictEqual(oa.observability.ok, true);
  assert.strictEqual(oa.observability.clearedExternalStrangerCashTodayUsd, 0.0);
  assert.strictEqual(oa.observability.historicalReconciledStripeLifetimeUsd, 149.0);
  assert.strictEqual(oa.analytics.ok, true);
  assert.ok(oa.analytics.trueStripeCheckoutStarts24h >= 8);

  const ver = getVersioningState();
  assert.strictEqual(ver.ok, true);
  assert.strictEqual(ver.semver, '1.0.0');

  const fab = evaluateFlagsAndCheckoutAbTest(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
  assert.strictEqual(fab.featureFlags.ok, true);
  assert.strictEqual(fab.abTesting.ok, true);
  assert.strictEqual(fab.abTesting.deterministicAssignments.length, 6);

  const tl = auditTagsAndLabels();
  assert.strictEqual(tl.tags.ok, true);
  assert.strictEqual(tl.labels.ok, true);

  const rhc = auditRollbackHotfixAndCd({ executeRollback: false });
  assert.strictEqual(rhc.rollbacks.ok, true);
  assert.strictEqual(rhc.hotfixes.ok, true);
  assert.strictEqual(rhc.continuousDeploy.ok, true);

  const full = runAllTenProductionPillars();
  assert.strictEqual(full.ok, true);
  assert.strictEqual(full.pillarsVerifiedCount, 10);

  console.log('test-mac-yolo-release-cd-engine: PASS (all 10 production & revenue pillars verified)');
}

main();
