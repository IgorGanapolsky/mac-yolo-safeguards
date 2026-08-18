#!/usr/bin/env node
'use strict';

/**
 * test-lorebook-context-engine.js
 * -------------------------------
 * Verifies SillyTavern-style triggered Lorebooks, Persona Cards, and Macro Expansion:
 *   - Trigger-based lazy context injection (matches query keywords)
 *   - Token savings percentage calculation (>80% savings when un-triggered)
 *   - Persona character card retrieval with sampling hyperparameters
 *   - Macro variable interpolation
 *   - Doctor & readiness diagnostic
 */

const assert = require('assert');
const {
  DEFAULT_LORE_ENTRIES,
  FLEET_PERSONAS,
  scanTriggeredContext,
  expandMacros,
  runDoctor,
} = require('../tools/lorebook-context-engine');

console.log('🧪 Running Lorebook & Triggered Context Engine Test Suite...');

// 1. Triggered Context Injection
{
  const stripeQuery = "How do we handle customer stripe checkout sessions?";
  const stripeRes = scanTriggeredContext(stripeQuery);
  assert.ok(stripeRes.triggeredEntries.length >= 1, 'Should trigger stripe lore');
  assert.ok(stripeRes.triggeredEntries.some((e) => e.id === 'lore-stripe-billing'));
  assert.ok(stripeRes.injectedContext.includes('Stripe operations use macOS Keychain'));
  assert.ok(stripeRes.tokensSavedPercent >= 60, 'Should save tokens by omitting unrelated lore');

  const emptyQuery = "Hello world, what is the weather today?";
  const emptyRes = scanTriggeredContext(emptyQuery);
  assert.strictEqual(emptyRes.triggeredEntries.length, 0);
  assert.strictEqual(emptyRes.injectedContext, '');
  assert.strictEqual(emptyRes.tokensSavedPercent, 100);
  console.log('  ✓ Trigger-based lazy context injection & token savings pass');
}

// 2. Persona Character Cards & Sampling Parameters
{
  assert.ok(FLEET_PERSONAS['chief-grok']);
  const chief = FLEET_PERSONAS['chief-grok'];
  assert.strictEqual(chief.temperature, 0.2);
  assert.strictEqual(chief.minP, 0.05);
  assert.ok(chief.systemPrompt.includes('Chief Grok Bot'));

  const qa = FLEET_PERSONAS['qa-auditor'];
  assert.strictEqual(qa.temperature, 0.0);
  assert.ok(qa.systemPrompt.includes('QA Auditor'));
  console.log('  ✓ Persona cards & sampling hyperparameters pass');
}

// 3. Macro Variable Interpolation
{
  const template = "Hello {{guardian}} on branch {{branch}}, inference cost is {{cost}}.";
  const expanded = expandMacros(template, { branch: 'feat/test' });
  assert.strictEqual(expanded, "Hello Igor Ganapolsky on branch feat/test, inference cost is $0.00.");
  console.log('  ✓ Macro variable template interpolation passes');
}

// 4. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.activeLoreEntries >= 5);
  assert.ok(doc.personasAvailable.length >= 3);
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All Lorebook & Triggered Context Engine tests passed successfully!');
process.exit(0);
