#!/usr/bin/env node
'use strict';

/**
 * test-jcode-yolo.js — Unit regression test for jcode-yolo CLI command.
 */

const assert = require('assert');
const { runJcodeYolo, getJcodeBinary, buildJcodeArgs } = require('../jcode-yolo-wrapper.js');

function testJcodeYoloExport() {
  assert.strictEqual(typeof runJcodeYolo, 'function');

  // Test provider fallback injection
  const defaultArgs = buildJcodeArgs(['run', 'hello']);
  assert.deepStrictEqual(defaultArgs, ['--provider', 'openai', 'run', 'hello']);

  const customArgs = buildJcodeArgs(['--provider', 'claude', 'run', 'hello']);
  assert.deepStrictEqual(customArgs, ['--provider', 'claude', 'run', 'hello']);

  const res = runJcodeYolo(['--version']);
  assert.strictEqual(res.status, 0);
  console.log('✅ jcode-yolo CLI execution unit test passed.');
}

function main() {
  console.log('=== Testing jcode-yolo CLI Command ===');
  testJcodeYoloExport();
  console.log('✅ jcode-yolo Test PASSED!');
}

main();
