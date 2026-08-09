#!/usr/bin/env node
'use strict';

/**
 * test-github-copilot-agent-harness.js — Unit regression test for GitHub Copilot Agent Harness.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { evaluateCopilotAgentConfidence, parseArgs } = require('../tools/github-copilot-agent-harness.js');

function testConfidenceEvaluation() {
  const good = evaluateCopilotAgentConfidence({ ciPassed: true, codeqlDebt: 0, testsPassed: true });
  assert.strictEqual(good.confidenceScore, 1.0);
  assert.strictEqual(good.fastTrackMergeable, true);

  const bad = evaluateCopilotAgentConfidence({ ciPassed: false, codeqlDebt: 2, testsPassed: false });
  assert.strictEqual(bad.fastTrackMergeable, false);
  assert(bad.confidenceScore < 0.5);
  console.log('✅ GitHub Copilot Agent confidence evaluation test passed.');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/github-copilot-agent-harness.js');
  const res = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit code 0, got ${res.status}`);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.specVersion, 'August 2026 (GitHub Copilot Agent Spec)');
  assert.strictEqual(json.confidenceScore, 1.0);
  console.log('✅ GitHub Copilot Agent CLI execution test passed.');
}

function main() {
  console.log('=== Testing GitHub Copilot Agent Harness ===');
  testConfidenceEvaluation();
  testCliExecution();
  console.log('✅ GitHub Copilot Agent Harness Test PASSED!');
}

main();
