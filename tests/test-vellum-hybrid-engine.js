#!/usr/bin/env node
'use strict';

/**
 * test-vellum-hybrid-engine.js
 * ----------------------------
 * Verifies Vellum-style hybrid hosting, 8-tier memory, and sandboxed credential isolation:
 *   - Local vs Cloud hosting mode switching
 *   - 8-tier memory structure ingestion & retrieval
 *   - Sandboxed credential isolation (prompt leak auditing)
 *   - Doctor & readiness diagnostic
 */

const assert = require('assert');
const {
  HOSTING_MODES,
  MEMORY_TIERS,
  setHostingMode,
  recordMemory,
  auditCredentialIsolation,
  loadState,
  runDoctor,
} = require('../tools/vellum-hybrid-engine');

console.log('🧪 Running Vellum Hybrid Engine Test Suite...');

// 1. Hybrid Hosting Switching
{
  const localRes = setHostingMode('local');
  assert.strictEqual(localRes.success, true);
  assert.strictEqual(localRes.activeConfig.id, 'local');
  assert.strictEqual(localRes.activeConfig.isAlwaysOn, false);

  const cloudRes = setHostingMode('cloud');
  assert.strictEqual(cloudRes.success, true);
  assert.strictEqual(cloudRes.activeConfig.id, 'cloud');
  assert.strictEqual(cloudRes.activeConfig.isAlwaysOn, true);

  // Restore to local
  setHostingMode('local');
  console.log('  ✓ Hybrid hosting mode switching passes (Local vs Cloud 24/7)');
}

// 2. 8-Tier Memory Architecture
{
  assert.strictEqual(MEMORY_TIERS.length, 8);
  assert.ok(MEMORY_TIERS.includes('episodic'));
  assert.ok(MEMORY_TIERS.includes('semantic'));
  assert.ok(MEMORY_TIERS.includes('procedural'));
  assert.ok(MEMORY_TIERS.includes('invariant'));

  recordMemory('episodic', { session: 'test-session', action: 'unit-verify' });
  recordMemory('invariant', { rule: 'NO_FORCE_PUSH_MAIN' });

  const state = loadState();
  assert.ok(state.memoryBanks.episodic.length > 0);
  assert.ok(state.memoryBanks.invariant.length > 0);
  console.log('  ✓ 8-Tier memory bank ingestion & persistence passes');
}

// 3. Sandboxed Credential Isolation
{
  const cleanPrompt = "Refactor the database connection to use drizzle schema.";
  const cleanAudit = auditCredentialIsolation(cleanPrompt);
  assert.strictEqual(cleanAudit.isSafe, true);
  assert.strictEqual(cleanAudit.leakedKeys.length, 0);

  const leakedPrompt = "Use apiKey ghp_1234567890123456789012 to fetch repository status.";
  const leakedAudit = auditCredentialIsolation(leakedPrompt);
  assert.strictEqual(leakedAudit.isSafe, false);
  assert.ok(leakedAudit.leakedKeys.length > 0);
  console.log('  ✓ Sandboxed credential isolation & leak detection passes');
}

// 4. Doctor & Readiness Diagnostic
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.strictEqual(doc.memoryTiersSupported.length, 8);
  assert.ok(doc.hostingConfig.name.length > 0);
  console.log('  ✓ Doctor status & metadata passes');
}

console.log('\n✅ All Vellum Hybrid Engine tests passed successfully!');
process.exit(0);
