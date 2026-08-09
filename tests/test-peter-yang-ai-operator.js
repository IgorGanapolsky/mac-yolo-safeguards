#!/usr/bin/env node
'use strict';

/**
 * test-peter-yang-ai-operator.js — Unit regression test for Peter Yang AI Operator Engine.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { runAudit, processPipeline, parseArgs } = require('../tools/peter-yang-ai-operator-engine.js');

function testAuditAndPipeline() {
  const audit = runAudit();
  assert.strictEqual(audit.status, 'PETER_YANG_AI_OPERATOR_ACTIVE');
  assert.strictEqual(audit.grade, '10/10 (MANAGED_AI_EXCELLENCE)');
  assert.strictEqual(audit.capabilities.length, 3);

  const pipe = processPipeline('episode_99');
  assert.strictEqual(pipe.success, true);
  assert.strictEqual(pipe.pipeline, 'episode_99');
  assert(pipe.stepsCompleted.length >= 4);
  console.log('✅ Peter Yang audit & pipeline unit test passed.');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/peter-yang-ai-operator-engine.js');
  const res = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit code 0, got ${res.status}`);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.status, 'PETER_YANG_AI_OPERATOR_ACTIVE');
  assert.strictEqual(json.inspirationSource, 'https://www.oceanstalent.com/peter');
  console.log('✅ Peter Yang CLI execution test passed.');
}

function main() {
  console.log('=== Testing Peter Yang AI Operator Engine ===');
  testAuditAndPipeline();
  testCliExecution();
  console.log('✅ Peter Yang AI Operator Test PASSED!');
}

main();
