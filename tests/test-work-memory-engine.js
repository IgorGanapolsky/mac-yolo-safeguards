'use strict';

/**
 * tests/test-work-memory-engine.js
 * Automated test suite for Work Memory & Quick-Recall Engine.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const {
  buildWorkMemoryIndex,
  recallWorkMemory,
  runCatchUp,
  runDoctor,
} = require('../tools/work-memory-engine');

const MEM_BIN = path.resolve(__dirname, '../tools/work-memory-engine.js');

console.log('🧪 Running Test Suite for Work Memory Engine...\n');

// Test 1: Build Index & Recall Probe
{
  const idx = buildWorkMemoryIndex();
  assert.ok(idx.gitBranch, 'Must extract current git branch');
  assert.ok(Array.isArray(idx.uncommittedFiles), 'Must extract uncommitted files array');

  const rec = recallWorkMemory(idx.gitBranch);
  assert.ok(rec.matchCount >= 1, 'Must find git branch match');
  console.log('✅ Test 1 Passed: Build Index & Recall Probe');
}

// Test 2: Catch-Up Session Summary
{
  const cu = runCatchUp();
  assert.ok(cu.headline.includes('Session Catch-Up'));
  assert.strictEqual(cu.bullets.length, 3);
  console.log('✅ Test 2 Passed: Catch-Up Session Summary');
}

// Test 3: Doctor Probe Execution
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.stolenFrom.includes('Littlebird AI'));
  console.log('✅ Test 3 Passed: Doctor Probe Execution');
}

// Test 4: CLI Execution
{
  const cliRun = spawnSync('node', [MEM_BIN, 'catch-up', '--json'], { encoding: 'utf8' });
  assert.strictEqual(cliRun.status, 0, 'CLI catch-up must exit 0');
  const parsed = JSON.parse(cliRun.stdout);
  assert.ok(parsed.headline);
  console.log('✅ Test 4 Passed: CLI Execution');
}

console.log('\n🎉 ALL 4 WORK MEMORY ENGINE TESTS PASSED SUCCESSFULLY!');
