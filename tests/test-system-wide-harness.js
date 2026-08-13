'use strict';

/**
 * tests/test-system-wide-harness.js
 * Automated master test suite for system-wide harness integration.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { runSystemWideDiagnostic } = require('../tools/system-wide-harness');

const HARNESS_BIN = path.resolve(__dirname, '../tools/system-wide-harness.js');

console.log('🧪 Running Master Test Suite for System-Wide Harness...\n');

// Test 1: Diagnostic Integration Probe across all 4 Engines
{
  const diag = runSystemWideDiagnostic();
  assert.strictEqual(diag.overallStatus, 'HEALTHY_SYSTEM_WIDE', 'Overall system status must be HEALTHY_SYSTEM_WIDE');
  assert.strictEqual(diag.engines.webIntelligence.status, 'READY');
  assert.strictEqual(diag.engines.copilotSdkBridge.status, 'READY');
  assert.strictEqual(diag.engines.hermesVoiceEngine.status, 'READY');
  assert.strictEqual(diag.engines.workMemoryEngine.status, 'READY');
  console.log('✅ Test 1 Passed: Master Diagnostic Integration Probe Across All 4 Engines');
}

// Test 2: CLI Master Doctor Probe
{
  const cliRun = spawnSync('node', [HARNESS_BIN, '--doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(cliRun.status, 0, 'CLI --doctor must exit 0');
  const parsed = JSON.parse(cliRun.stdout);
  assert.strictEqual(parsed.overallStatus, 'HEALTHY_SYSTEM_WIDE');
  console.log('✅ Test 2 Passed: CLI Master Doctor Probe');
}

// Test 3: CLI Catch-Up Execution
{
  const cliRun = spawnSync('node', [HARNESS_BIN, '--catch-up'], { encoding: 'utf8' });
  assert.strictEqual(cliRun.status, 0, 'CLI --catch-up must exit 0');
  assert.ok(cliRun.stdout.includes('Catch-Up'), 'Output must contain catch-up headline');
  console.log('✅ Test 3 Passed: CLI Catch-Up Execution');
}

console.log('\n🎉 ALL 3 SYSTEM-WIDE MASTER HARNESS TESTS PASSED SUCCESSFULLY!');
