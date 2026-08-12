'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');

console.log('=== Testing Standalone seed-yolo CLI ===');

// Test --version
const ver = spawnSync('seed-yolo', ['--version'], { encoding: 'utf8' });
assert.strictEqual(ver.status, 0, `seed-yolo --version failed: ${ver.stderr}`);
assert(ver.stdout.includes('Seed Agent Engine'), `Expected Seed Agent Engine output, got: ${ver.stdout}`);
console.log('✅ seed-yolo --version test passed.');

// Test one-shot execution
const run = spawnSync('seed-yolo', ['Reply with SEED-TEST-OK'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `seed-yolo one-shot execution failed: ${run.stderr}`);
assert(run.stdout.includes('SEED-TEST-OK'), `Expected SEED-TEST-OK output, got: ${run.stdout}`);
console.log('✅ seed-yolo one-shot prompt execution test passed.');

console.log('✅ Standalone seed-yolo CLI Test PASSED!\n');
