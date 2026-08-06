'use strict';

/**
 * Unit Tests for First-Minute Onboarding Engine (`tools/first-minute-onboarding.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { FLAGSHIP_STARTER_PROMPTS, auditFirstMinuteOnboarding } = require('../tools/first-minute-onboarding');

console.log('Running test-first-minute-onboarding.js...');

// Test 1: Starter prompts catalog
{
  assert.ok(FLAGSHIP_STARTER_PROMPTS.length >= 3, 'Expected at least 3 flagship starter prompts');
  assert.strictEqual(FLAGSHIP_STARTER_PROMPTS[0].id, 'mac-freeze-rescue', 'Expected mac-freeze-rescue as first prompt');
}

// Test 2: Onboarding time-to-first-win audit
{
  const res = auditFirstMinuteOnboarding();
  assert.strictEqual(res.overallRating, '10/10 (PROMPT_FIRST_A_PLUS)', 'Expected 10/10 rating');
  assert.strictEqual(res.status, 'CONCRETE_WIN_DELIVERED_UNDER_60S', 'Expected time-to-first-win under 60 seconds');
}

console.log('ok tests/test-first-minute-onboarding.js');
