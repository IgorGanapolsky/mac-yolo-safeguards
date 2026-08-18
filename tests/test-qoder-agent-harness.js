#!/usr/bin/env node
'use strict';

/**
 * test-qoder-agent-harness.js
 * ---------------------------
 * Verifies Qoder-style Agent SDK capabilities:
 *   - Task decomposition into sub-agent goals
 *   - File snapshot creation and clean rollback
 *   - Loop convergence evaluation (capping failure streaks)
 *   - Doctor & readiness diagnostic
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  decomposeTask,
  createSnapshot,
  rollbackSnapshot,
  evaluateConvergence,
  runDoctor,
} = require('../tools/qoder-agent-harness');

console.log('🧪 Running Qoder Agent Harness Test Suite...');

// 1. Task Decomposition
{
  const complexPrompt = "Refactor database models, and then apply migrations, and then run integration tests";
  const subtasks = decomposeTask(complexPrompt);
  assert.strictEqual(subtasks.length, 3, 'Should split into 3 distinct sub-tasks');
  assert.strictEqual(subtasks[0].step, 1);
  assert.ok(subtasks[0].goal.includes('Refactor database models'));
  assert.strictEqual(subtasks[2].step, 3);
  console.log('  ✓ Task decomposition into ordered sub-goals passes');
}

// 2. Snapshot & Rollback State Machine
{
  const tempFile = path.join(os.tmpdir(), `test-qoder-file-${Date.now()}.txt`);
  fs.writeFileSync(tempFile, 'ORIGINAL_CONTENT_V1', 'utf8');

  const snapshotId = `test-snap-${Date.now()}`;
  const snap = createSnapshot(snapshotId, [tempFile]);
  assert.strictEqual(snap.id, snapshotId);
  assert.strictEqual(snap.files[tempFile], 'ORIGINAL_CONTENT_V1');

  // Mutate file
  fs.writeFileSync(tempFile, 'CORRUPTED_CONTENT_V2', 'utf8');
  assert.strictEqual(fs.readFileSync(tempFile, 'utf8'), 'CORRUPTED_CONTENT_V2');

  // Rollback
  const rb = rollbackSnapshot(snapshotId);
  assert.strictEqual(rb.success, true);
  assert.strictEqual(fs.readFileSync(tempFile, 'utf8'), 'ORIGINAL_CONTENT_V1');

  // Cleanup
  fs.unlinkSync(tempFile);
  console.log('  ✓ File snapshot creation and clean rollback passes');
}

// 3. Convergence Guard
{
  const normalHistory = [
    { tool: 'read_file' },
    { tool: 'replace_file_content' },
    { tool: 'run_command' },
  ];
  const normalEval = evaluateConvergence(normalHistory);
  assert.strictEqual(normalEval.isConverging, true);
  assert.strictEqual(normalEval.shouldHalt, false);

  const failingHistory = [
    { tool: 'run_command', error: true },
    { tool: 'run_command', error: true },
    { tool: 'run_command', error: true },
  ];
  const failingEval = evaluateConvergence(failingHistory);
  assert.strictEqual(failingEval.isConverging, false);
  assert.strictEqual(failingEval.shouldHalt, true, 'Should halt on 3 consecutive errors');
  console.log('  ✓ Loop convergence evaluation & failure streak halting passes');
}

// 4. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.strictEqual(doc.maxConsecutiveFailures, 3);
  assert.strictEqual(doc.maxTurnToolCalls, 25);
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All Qoder Agent Harness tests passed successfully!');
process.exit(0);
