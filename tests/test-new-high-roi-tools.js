'use strict';

/**
 * tests/test-new-high-roi-tools.js
 * Automated test suite for Grok-Bot, Gurobi Community, and Gurobot Optimizer tools.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const grokBot = require('../tools/grok-bot-harness');
const gurobiComm = require('../tools/gurobi-community-engage');
const gurobotOpt = require('../tools/gurobot-optimizer');

console.log('🧪 Running Automated Test Suite for New High-ROI Tools...\n');

// Test 1: Grok-Bot Teammate Harness Probe
{
  const doc = grokBot.runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.stolenFrom.includes('xAI Grok-Bot'));
  console.log('✅ Test 1 Passed: Grok-Bot Teammate Harness Probe');
}

// Test 2: Gurobi Community Engagement Pipeline Probe
{
  const doc = gurobiComm.runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.strictEqual(doc.accountEmail, 'igor@igorganapolsky.com');
  const polled = gurobiComm.pollCommunityTopics();
  assert.ok(polled.length >= 2);
  console.log('✅ Test 2 Passed: Gurobi Community Engagement Pipeline Probe');
}

// Test 3: Gurobot AI Optimization Code Generator Probe
{
  const doc = gurobotOpt.runDoctor();
  assert.strictEqual(doc.status, 'READY');
  const code = gurobotOpt.generateGurobiCode('Knapsack problem max weight 50');
  assert.ok(code.includes('import gurobipy as gp'));
  assert.ok(code.includes('computeIIS()'));
  console.log('✅ Test 3 Passed: Gurobot AI Optimization Code Generator Probe');
}

// Test 4: CLI Execution for all 3 tools
{
  const run1 = spawnSync('node', [path.resolve(__dirname, '../tools/grok-bot-harness.js'), '--doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(run1.status, 0);

  const run2 = spawnSync('node', [path.resolve(__dirname, '../tools/gurobi-community-engage.js'), '--doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(run2.status, 0);

  const run3 = spawnSync('node', [path.resolve(__dirname, '../tools/gurobot-optimizer.js'), '--doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(run3.status, 0);

  console.log('✅ Test 4 Passed: CLI Execution Probe across all 3 tools');
}

console.log('\n🎉 ALL 4 NEW HIGH-ROI TOOL TESTS PASSED SUCCESSFULLY!');
