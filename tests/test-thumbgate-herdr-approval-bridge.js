'use strict';

/**
 * Unit Tests for ThumbGate & Herdr Approval Bridge (`tools/thumbgate-herdr-approval-bridge.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const {
  bridgeThumbgateGateToHerdr,
  resolveThumbgateGate,
  runThumbgateHerdrBridgeDiagnostic
} = require('../tools/thumbgate-herdr-approval-bridge');

console.log('Running test-thumbgate-herdr-approval-bridge.js...');

// Test 1: Gate Bridging
{
  const event = bridgeThumbgateGateToHerdr('gate-test-123', 'run_command', 'Delete production database', 'worker-bot');
  assert.strictEqual(event.herdrState, 'blocked', 'Expected Herdr state to be blocked');
  assert.strictEqual(event.status, 'HERDR_PANE_BLOCKED_FOR_THUMBGATE', 'Expected HERDR_PANE_BLOCKED_FOR_THUMBGATE status');
  assert.ok(event.approvalCommand.includes('--approve gate-test-123'), 'Expected approval command with gate ID');
}

// Test 2: Gate Resolution
{
  const res = resolveThumbgateGate('gate-test-123', 'Igor');
  assert.strictEqual(res.herdrState, 'working', 'Expected Herdr state reset to working');
  assert.strictEqual(res.status, 'THUMBGATE_APPROVAL_RESOLVED', 'Expected THUMBGATE_APPROVAL_RESOLVED status');
}

// Test 3: Full Diagnostic
{
  const diag = runThumbgateHerdrBridgeDiagnostic();
  assert.strictEqual(diag.overallRating, '10/10 (THUMBGATE_HERDR_BRIDGE_A_PLUS)', 'Expected Grade A+ rating');
}

console.log('ok tests/test-thumbgate-herdr-approval-bridge.js');
