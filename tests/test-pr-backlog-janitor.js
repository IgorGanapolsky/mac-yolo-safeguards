#!/usr/bin/env node
'use strict';

/**
 * test-pr-backlog-janitor.js — Unit regression test for Serial Merge Discipline & Backlog Janitor.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { MAX_CONCURRENT_OPEN_PRS } = require('../tools/pr-backlog-janitor.js');

function testJanitorConstants() {
  assert.strictEqual(MAX_CONCURRENT_OPEN_PRS, 3);
  console.log('✅ Serial Merge Discipline & Backlog Janitor unit test passed.');
}

function main() {
  console.log('=== Testing Serial Merge Discipline & Backlog Janitor ===');
  testJanitorConstants();
  console.log('✅ Serial Merge Discipline & Backlog Janitor Test PASSED!');
}

main();
