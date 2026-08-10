#!/usr/bin/env node
'use strict';

/**
 * test-browseros-agent-harness.js — Unit regression test for BrowserOS Agent Harness.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { getBrowserOSStatus, parseArgs } = require('../tools/browseros-agent-harness.js');

function testStatusReport() {
  const status = getBrowserOSStatus();
  assert.strictEqual(status.mcpServer, 'browseros-neo');
  assert.strictEqual(typeof status.mcpInstalled, 'boolean');
  assert.strictEqual(Array.isArray(status.supportedProviders), true);
  assert(status.supportedProviders.includes('ollama'));
  assert(status.supportedProviders.includes('openrouter'));
  console.log('✅ BrowserOS status report unit test passed.');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/browseros-agent-harness.js');
  const res = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit code 0, got ${res.status}`);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.mcpServer, 'browseros-neo');
  assert(json.tools.length >= 0);
  console.log('✅ BrowserOS CLI execution test passed.');
}

function main() {
  console.log('=== Testing BrowserOS Agent Harness ===');
  testStatusReport();
  testCliExecution();
  console.log('✅ BrowserOS Agent Harness Test PASSED!');
}

main();
