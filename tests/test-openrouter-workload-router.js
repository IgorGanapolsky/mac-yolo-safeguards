#!/usr/bin/env node
'use strict';

/**
 * test-openrouter-workload-router.js — Unit regression test for OpenRouter Workload Cost & Model Router.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { classifyWorkload, selectOpenRouterRoute, WORKLOAD_TIERS } = require('../tools/openrouter-workload-router.js');

function testWorkloadClassification() {
  const light = classifyWorkload('format docstrings and fix typos');
  assert.strictEqual(light.tier, 'tier_1_light');

  const coding = classifyWorkload('write unit tests and refactor function');
  assert.strictEqual(coding.tier, 'tier_2_coding');

  const frontier = classifyWorkload('perform complex multi-file architecture security audit');
  assert.strictEqual(frontier.tier, 'tier_3_frontier');

  console.log('✅ OpenRouter Workload Classification unit test passed.');
}

function testRouteSelection() {
  const route = selectOpenRouterRoute('format comments and update docs');
  assert.strictEqual(route.classifiedTier, 'tier_1_light');
  assert.strictEqual(route.selectedModel, 'deepseek/deepseek-chat');
  assert.ok(route.optimizationRatio.includes('95% cost savings'));
  console.log('✅ OpenRouter Route Selection unit test passed.');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/openrouter-workload-router.js');
  const res = spawnSync('node', [scriptPath, '--route', 'write python script', '--json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit code 0, got ${res.status}`);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.classifiedTier, 'tier_2_coding');
  assert.strictEqual(json.selectedModel, 'qwen/qwen-2.5-coder-32b-instruct');
  console.log('✅ OpenRouter Workload Router CLI execution test passed.');
}

function main() {
  console.log('=== Testing OpenRouter Workload Cost & Model Router ===');
  testWorkloadClassification();
  testRouteSelection();
  testCliExecution();
  console.log('✅ OpenRouter Workload Cost & Model Router Test PASSED!');
}

main();
