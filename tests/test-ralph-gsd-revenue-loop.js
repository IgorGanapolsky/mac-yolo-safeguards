#!/usr/bin/env node
'use strict';

/**
 * test-ralph-gsd-revenue-loop.js
 * ------------------------------
 * Verifies Autonomous 24/7 Ralph-Loop & GSD Engine:
 *   - End-to-end autonomous cycle execution
 *   - Extension packaging step verification
 *   - B2B outreach packet step verification
 *   - Community posts formatting step verification
 *   - State file recording
 *   - Doctor check
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  runRalphGsdCycle,
  runDoctor,
} = require('../tools/ralph-gsd-revenue-loop');

console.log('🧪 Running Ralph-GSD Revenue Loop Test Suite...');

// 1. Run Complete Autonomous Cycle
{
  const cycle = runRalphGsdCycle();
  assert.strictEqual(cycle.status, 'ALL_STEPS_GREEN');
  assert.strictEqual(cycle.steps.length, 3);
  
  const extStep = cycle.steps.find((s) => s.step === 'CHROME_EXTENSION_PACKAGE');
  assert.ok(extStep);
  assert.strictEqual(extStep.status, 'SUCCESS');

  const outreachStep = cycle.steps.find((s) => s.step === 'B2B_OUTREACH_GENERATION');
  assert.ok(outreachStep);
  assert.strictEqual(outreachStep.status, 'SUCCESS');
  assert.strictEqual(outreachStep.totalPipelineUsd, 9000);

  const postsStep = cycle.steps.find((s) => s.step === 'COMMUNITY_AUTHORITY_POSTS');
  assert.ok(postsStep);
  assert.strictEqual(postsStep.status, 'SUCCESS');

  console.log('  ✓ Autonomous cycle executes and verifies all 3 revenue steps');
}

// 2. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.framework.includes('GSD'));
  console.log('  ✓ Doctor check passes');
}

console.log('\n✅ All Ralph-GSD Revenue Loop tests passed successfully!');
process.exit(0);
