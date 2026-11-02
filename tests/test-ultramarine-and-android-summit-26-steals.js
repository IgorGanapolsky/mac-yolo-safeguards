#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  MODEL_SPEC,
  routeUltramarineTask,
  evaluateClientReadinessRubric,
  evaluateEmulatorFreePreviewGate,
  evaluateAndroidSummit26AgentHarness,
  runAllUltramarineAndAndroid26Steals,
} = require('../tools/ultramarine-and-android-summit-26-steals');

function main() {
  // 1. Ultramarine 1 Flash 320B-A18B 1M-context spec & economics
  assert.strictEqual(MODEL_SPEC.totalParamsB, 320);
  assert.strictEqual(MODEL_SPEC.activeParamsB, 18);
  assert.strictEqual(MODEL_SPEC.contextWindowTokens, 1_000_000);
  assert.strictEqual(MODEL_SPEC.pricingPerMillionUsd.input, 0.15);
  assert.strictEqual(MODEL_SPEC.pricingPerMillionUsd.cachedInput, 0.03);
  assert.strictEqual(MODEL_SPEC.pricingPerMillionUsd.output, 0.50);

  const route = routeUltramarineTask({ inputTokens: 100_000, outputTokens: 10_000, cachedRatio: 0.8 });
  assert.strictEqual(route.ok, true);
  assert.strictEqual(route.fitsInSingle1MContext, true);
  assert.strictEqual(route.tokens.effectiveOutputTokens, 9350); // -6.5% token reduction
  assert.ok(route.economics.savingsPct >= 98.0);
  assert.strictEqual(route.failoverChain.length, 4);

  // 2. Client-Readiness Rubric (Substance, Reconciliation, Restrained Presentation)
  const goodRubric = evaluateClientReadinessRubric({
    text: 'Five periods of segment sales and earnings in one table, with every subtotal and total reconciling.',
    numbersReconcile: true,
  });
  assert.strictEqual(goodRubric.ok, true);
  assert.strictEqual(goodRubric.score, 100);

  const badEmojiRubric = evaluateClientReadinessRubric({
    text: 'Here is the disk table 🖴 🤖 with emoji slop.',
    numbersReconcile: true,
  });
  assert.strictEqual(badEmojiRubric.ok, false);

  // 3. Android Dev Summit '26 Emulator-Free Preview Gate (77% faster, 3x fewer tokens)
  const preview = evaluateEmulatorFreePreviewGate({ usesEmulator: false, baselineDurationSec: 100, baselineTokens: 30_000 });
  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.speedupPct, 77);
  assert.strictEqual(preview.tokenReductionFactor, 3.0);
  assert.strictEqual(preview.estimatedTokens, 10_000);

  // 4. BYOA + 30+ Skill Efficiency Multiplier (1.9x faster, 1.3x fewer tokens)
  const byoa = evaluateAndroidSummit26AgentHarness({ agent: 'antigravity', skillLoaded: true });
  assert.strictEqual(byoa.ok, true);
  assert.strictEqual(byoa.speedMultiplier, 1.9);
  assert.strictEqual(byoa.tokenSavingMultiplier, 1.3);

  // 5. Full suite
  const all = runAllUltramarineAndAndroid26Steals();
  assert.strictEqual(all.ok, true);

  console.log('test-ultramarine-and-android-summit-26-steals: PASS');
}

main();
