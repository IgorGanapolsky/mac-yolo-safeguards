'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { evaluateRtebRetrieval } = require('../tools/rteb-retrieval-evaluator');

console.log('=== Testing Hugging Face RTEB Retrieval Evaluator ===');

// Test 1: Programmatic Evaluation
const result = evaluateRtebRetrieval();
assert.strictEqual(result.overallStatus, '10/10 (RTEB CERTIFIED GOLD)');
assert.strictEqual(result.evaluations.length, 4);
assert.strictEqual(result.evaluations[0].passed, true);

// Test 2: CLI JSON Mode
const run = spawnSync('node', ['tools/rteb-retrieval-evaluator.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `rteb-retrieval-evaluator failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.benchmark, 'HuggingFace RTEB (Retrieval Text Embedding Benchmark)');
assert.strictEqual(data.averageNdcgAt10, 0.942);

console.log('✅ Hugging Face RTEB Retrieval Evaluator unit test passed.\n');
