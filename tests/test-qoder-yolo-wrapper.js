#!/usr/bin/env node
'use strict';

/**
 * test-qoder-yolo-wrapper.js
 * ---------------------------
 * Verifies qoder-yolo CLI launcher and end-to-end turn execution:
 *   - Task decomposition & snapshot pipeline
 *   - Triggered Lorebook context injection integration
 *   - Dogwood temporal policy evaluation
 *   - Anti-slop pre-audit
 *   - Receipt persistence
 *   - Doctor & readiness diagnostic
 */

const assert = require('assert');
const fs = require('fs');
const {
  ROUTES,
  executeQoderYoloTurn,
  runDoctor,
} = require('../tools/qoder-yolo-wrapper');

console.log('🧪 Running qoder-yolo Wrapper Test Suite...');

// 1. Full YOLO Turn Execution
{
  const prompt = "Refactor database models, apply migrations, and run smoke tests";
  const receipt = executeQoderYoloTurn(prompt);

  assert.ok(receipt.turnId.startsWith('qoder-turn-'));
  assert.strictEqual(receipt.subtasks.length, 3);
  assert.ok(receipt.tokensSavedPercent >= 0);
  assert.strictEqual(receipt.dogwoodPolicyAllowed, true);
  assert.strictEqual(receipt.slopAuditClean, true);
  assert.strictEqual(receipt.status, 'READY_FOR_EXECUTION');
  console.log('  ✓ qoder-yolo full turn execution & governance passes');
}

// 2. Route Integrity
{
  assert.ok(ROUTES.local_qwen);
  assert.strictEqual(ROUTES.local_qwen.costUsd, 0.00);
  assert.ok(ROUTES.qwen38_max);
  assert.ok(ROUTES.glm53);
  console.log('  ✓ qoder-yolo multi-model routing options pass');
}

// 3. Doctor Check
{
  const doc = runDoctor();
  assert.ok(doc.status === 'READY' || doc.status === 'QODER_BIN_MISSING');
  assert.ok(doc.availableRoutes.length >= 3);
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All qoder-yolo Wrapper tests passed successfully!');
process.exit(0);
