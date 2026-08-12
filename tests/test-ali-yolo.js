'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');

console.log('=== Testing Standalone ali-yolo CLI ===');

// Test --doctor
const doc = spawnSync('ali-yolo', ['--doctor'], { encoding: 'utf8' });
assert.strictEqual(doc.status, 0, `ali-yolo --doctor failed: ${doc.stderr}`);
assert(doc.stdout.includes('ALI_YOLO_READY'), `Expected ALI_YOLO_READY output, got: ${doc.stdout}`);
console.log('✅ ali-yolo --doctor test passed.');

// Test one-shot execution
const run = spawnSync('ali-yolo', ['Reply with ALI-TEST-OK'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `ali-yolo one-shot execution failed: ${run.stderr}`);
assert(run.stdout.includes('ALI-TEST-OK'), `Expected ALI-TEST-OK output, got: ${run.stdout}`);
console.log('✅ ali-yolo one-shot prompt execution test passed.');

console.log('✅ Standalone ali-yolo CLI Test PASSED!\n');
