#!/usr/bin/env node
'use strict';

/**
 * test-thumbgate-wake-governance.js
 * ---------------------------------
 * Verifies ThumbGate Wake & Checkpoint Governance Engine (stolen from Qoder):
 *   - Atomic pre-action checkpoint creation
 *   - Instant file rollback from checkpoint
 *   - Automated repo wiki documentation compiler
 *   - Doctor & watchdog readiness check
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  createCheckpoint,
  restoreCheckpoint,
  generateRepoWiki,
  runDoctor,
} = require('../tools/thumbgate-wake-governance');

console.log('🧪 Running ThumbGate Wake Governance Test Suite...');

// 1. Checkpoint Creation & Instant Rollback
{
  const tempFile = path.join(os.tmpdir(), `tg-wake-test-${Date.now()}.txt`);
  fs.writeFileSync(tempFile, 'THUMBGATE_PROTECTED_V1', 'utf8');

  const checkpointId = `tg-snap-${Date.now()}`;
  const snap = createCheckpoint(checkpointId, [tempFile]);
  assert.strictEqual(snap.id, checkpointId);
  assert.strictEqual(snap.files[tempFile], 'THUMBGATE_PROTECTED_V1');

  // Mutate file
  fs.writeFileSync(tempFile, 'THUMBGATE_CORRUPTED_V2', 'utf8');
  assert.strictEqual(fs.readFileSync(tempFile, 'utf8'), 'THUMBGATE_CORRUPTED_V2');

  // Restore Checkpoint
  const res = restoreCheckpoint(checkpointId);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.restoredCount, 1);
  assert.strictEqual(fs.readFileSync(tempFile, 'utf8'), 'THUMBGATE_PROTECTED_V1');

  // Cleanup
  fs.unlinkSync(tempFile);
  console.log('  ✓ Pre-action checkpoint creation and instant rollback passes');
}

// 2. Repo Wiki Generation
{
  const wiki = generateRepoWiki(path.resolve(__dirname, '..'));
  assert.ok(wiki.includes('ThumbGate Project Architecture Wiki'));
  assert.ok(wiki.includes('Core Statistics'));
  assert.ok(wiki.includes('Key Subsystems'));
  console.log('  ✓ Automated project wiki generation passes');
}

// 3. Doctor Status
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.strictEqual(doc.daemonStatus, 'ACTIVE');
  assert.ok(doc.monitoredAgents.includes('qoder-yolo'));
  console.log('  ✓ Doctor status & always-on watchdog passes');
}

console.log('\n✅ All ThumbGate Wake Governance tests passed successfully!');
process.exit(0);
