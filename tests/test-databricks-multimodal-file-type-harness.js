'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { runMultimodalFileTypeHarness } = require('../tools/databricks-multimodal-file-type-harness');

console.log('=== Testing Databricks Multimodal FILE Column Type Harness ===');

// Test 1: Programmatic Evaluation
const result = runMultimodalFileTypeHarness();
assert.strictEqual(result.overallStatus, '10/10 (FILE COLUMN TYPE HARNESS PASSED)');
assert.strictEqual(result.queryResults.length, 1);
assert.strictEqual(result.queryResults[0].recording_file.content_type, 'audio/wav');
assert.strictEqual(result.lifecycleDeletion.purgedBlobURIs.length, 2);

// Test 2: CLI JSON Mode
const run = spawnSync('node', ['tools/databricks-multimodal-file-type-harness.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `databricks-multimodal-file-type-harness failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.overallStatus, '10/10 (FILE COLUMN TYPE HARNESS PASSED)');

console.log('✅ Databricks Multimodal FILE Column Type unit test passed.\n');
