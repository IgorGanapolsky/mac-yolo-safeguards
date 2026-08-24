#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const stateFile = path.join(os.tmpdir(), `vellum-hybrid-state-${process.pid}.json`);
process.env.VELLUM_HYBRID_STATE = stateFile;

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

{
  const localRes = setHostingMode('local');
  assert.strictEqual(localRes.success, true);
  assert.strictEqual(localRes.activeConfig.id, 'local');
  assert.strictEqual(localRes.activeConfig.isAlwaysOn, false);
  assert.strictEqual(localRes.activeConfig.isOfficialVellumCloud, false);
  assert.strictEqual(localRes.activeConfig.isThumbgate, false);

  const cloudRes = setHostingMode('cloud');
  assert.strictEqual(cloudRes.success, true);
  assert.strictEqual(cloudRes.activeConfig.id, 'cloud');
  assert.strictEqual(cloudRes.activeConfig.isAlwaysOn, true);
  assert.strictEqual(cloudRes.activeConfig.isOfficialVellumCloud, false);
  assert.strictEqual(cloudRes.activeConfig.isThumbgate, false);
  assert.ok(!/thumbgate/i.test(cloudRes.activeConfig.endpoint));
  assert.ok(!/thumbgate/i.test(cloudRes.activeConfig.name));
  assert.match(cloudRes.activeConfig.name, /not Vellum Cloud/i);

  setHostingMode('local');
  console.log('  ✓ Hybrid hosting is honest (not ThumbGate, not official Vellum Cloud)');
}

{
  assert.strictEqual(MEMORY_TIERS.length, 8);
  recordMemory('episodic', { session: 'test-session', action: 'unit-verify' });
  recordMemory('invariant', { rule: 'NO_FORCE_PUSH_MAIN' });
  const state = loadState();
  assert.ok(state.memoryBanks.episodic.length > 0);
  assert.ok(state.memoryBanks.invariant.length > 0);
  console.log('  ✓ 8-Tier memory bank ingestion & persistence passes');
}

{
  const cleanAudit = auditCredentialIsolation('Refactor the database connection.');
  assert.strictEqual(cleanAudit.isSafe, true);
  const leakedAudit = auditCredentialIsolation(
    'Use apiKey ghp_1234567890123456789012 to fetch repository status.',
  );
  assert.strictEqual(leakedAudit.isSafe, false);
  console.log('  ✓ Sandboxed credential isolation & leak detection passes');
}

{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.strictEqual(doc.isOfficialVellumCloud, false);
  assert.strictEqual(doc.isThumbgate, false);
  assert.strictEqual(doc.memoryTiersSupported.length, 8);
  assert.ok(!/thumbgate/i.test(HOSTING_MODES.CLOUD.endpoint));
  assert.ok(!/thumbgate/i.test(HOSTING_MODES.LOCAL.endpoint));
  assert.match(HOSTING_MODES.CLOUD.description, /different product/i);
  console.log('  ✓ Doctor status & honest vendor metadata passes');
}

try {
  fs.unlinkSync(stateFile);
} catch {
  /* ignore */
}

console.log('\n✅ All Vellum Hybrid Engine tests passed successfully!');
process.exit(0);
