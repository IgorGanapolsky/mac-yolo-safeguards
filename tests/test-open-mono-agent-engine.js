'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const {
  detectHardwareProfile,
  evaluatePathSecurity,
  getDualBoxRelayStatus,
  extractCodeIntelligence,
  runPlaybook,
  runDoctor,
} = require('../tools/open-mono-agent-engine');

test('OpenMonoAgent.ai High-ROI Engine Test Suite', async (t) => {
  await t.test('detectHardwareProfile detects host capabilities and zero marginal cost', () => {
    const hw = detectHardwareProfile();
    assert.ok(hw.platform);
    assert.ok(hw.totalMemoryGb > 0);
    assert.equal(hw.marginalCostUsd, 0.00);
    assert.equal(hw.meterStatus, 'ZERO_METER_UNLIMITED_TOKENS');
  });

  await t.test('evaluatePathSecurity blocks sensitive paths fail-closed', () => {
    const blockedPaths = [
      path.join(os.homedir(), '.ssh', 'id_rsa'),
      path.join(os.homedir(), '.aws', 'credentials'),
      '/workspace/.env.production',
      '/workspace/server.key',
    ];

    for (const p of blockedPaths) {
      const sec = evaluatePathSecurity(p);
      assert.equal(sec.allowed, false, `Expected ${p} to be blocked`);
      assert.equal(sec.decision, 'DENIED_BY_SENSITIVE_SHIELD');
    }

    const allowedSec = evaluatePathSecurity('tools/system-wide-harness.js');
    assert.equal(allowedSec.allowed, true);
    assert.equal(allowedSec.decision, 'ALLOWED');
  });

  await t.test('getDualBoxRelayStatus returns valid mobile companion config', () => {
    const relay = getDualBoxRelayStatus();
    assert.equal(relay.schema, 'openmono-dualbox-relay/v1');
    assert.equal(relay.mode, 'DUAL_BOX_MOBILE_COMPANION');
    assert.equal(relay.features.biometricLeash, true);
    assert.equal(relay.features.zeroCloudRelay, true);
  });

  await t.test('extractCodeIntelligence parses AST symbols and imports with zero token cost', () => {
    const ast = extractCodeIntelligence('tools/open-mono-agent-engine.js');
    assert.equal(ast.intelligenceTier, 'ROSLYN_STYLE_LOCAL_AST');
    assert.equal(ast.cloudTokensUsed, 0);
    assert.equal(ast.costUsd, 0.00);
    assert.ok(ast.symbols.functions.includes('detectHardwareProfile'));
    assert.ok(ast.symbols.functions.includes('evaluatePathSecurity'));
  });

  await t.test('runPlaybook executes deterministic step sequence with zero cost', () => {
    const result = runPlaybook('code_audit');
    assert.equal(result.allPassed, true);
    assert.equal(result.costUsd, 0.00);
    assert.equal(result.steps.length, 4);
    assert.equal(result.steps[0].status, 'PASS');
  });

  await t.test('runDoctor returns operational diagnostic report', () => {
    const doc = runDoctor();
    assert.equal(doc.status, 'OPERATIONAL_ZERO_METER');
    assert.equal(doc.marginalTokenCost, '$0.00');
    assert.ok(doc.manifesto.includes('Unlimited tokens. Forever.'));
  });
});
