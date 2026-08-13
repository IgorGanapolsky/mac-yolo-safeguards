'use strict';

/**
 * tests/test-copilot-sdk-bridge.js
 * Automated test suite for GitHub Copilot SDK Integration Bridge.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const {
  CopilotClient,
  CopilotSession,
  BuiltInTools,
  defineTool,
  runDoctor,
} = require('../tools/copilot-sdk-bridge');

const BRIDGE_BIN = path.resolve(__dirname, '../tools/copilot-sdk-bridge.js');

console.log('🧪 Running Test Suite for GitHub Copilot SDK Bridge...\n');

// Test 1: SDK Exports & Class Availability
{
  assert.ok(CopilotClient, 'CopilotClient class must be exported');
  assert.ok(CopilotSession, 'CopilotSession class must be exported');
  assert.ok(BuiltInTools, 'BuiltInTools must be exported');
  assert.strictEqual(typeof defineTool, 'function', 'defineTool must be a function');
  console.log('✅ Test 1 Passed: SDK Exports & Class Availability');
}

// Test 2: Doctor Diagnostic Probe
{
  const report = runDoctor();
  assert.strictEqual(report.status, 'READY');
  assert.strictEqual(report.sdkVersion, '1.0.9');
  assert.ok(report.supportedLanguages.includes('TypeScript'));
  assert.ok(report.supportedLanguages.includes('Python'));
  assert.ok(report.supportedLanguages.includes('Go'));
  console.log('✅ Test 2 Passed: Doctor Diagnostic Probe');
}

// Test 3: CLI Execution
{
  const cliRun = spawnSync('node', [BRIDGE_BIN, '--doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(cliRun.status, 0, 'CLI --doctor must exit 0');
  const parsed = JSON.parse(cliRun.stdout);
  assert.strictEqual(parsed.status, 'READY');
  assert.strictEqual(parsed.service, 'github-copilot-sdk-bridge');
  console.log('✅ Test 3 Passed: CLI Execution');
}

console.log('\n🎉 ALL 3 COPILOT SDK BRIDGE TESTS PASSED SUCCESSFULLY!');
