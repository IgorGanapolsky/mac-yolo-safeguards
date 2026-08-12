'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { sliceMatryoshkaVector, cosineSimilarity } = require('../tools/matryoshka-agentic-memory-engine');

console.log('=== Testing Matryoshka Agentic Memory Engine ===');

// Test 1: Matryoshka Slicing
const vec1024 = new Array(1024).fill(1);
const sliced512 = sliceMatryoshkaVector(vec1024, 512);
assert.strictEqual(sliced512.length, 512, 'Matryoshka vector truncation failed');

// Test 2: Cosine Similarity
const sim = cosineSimilarity([1, 0, 0], [1, 0, 0]);
assert.strictEqual(sim, 1.0, 'Cosine similarity check failed');

// Test 3: CLI execution
const run = spawnSync('node', ['tools/matryoshka-agentic-memory-engine.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `matryoshka-agentic-memory-engine CLI failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.overallStatus, '10/10 (PASS)');
assert.strictEqual(data.agenticMemoryCache.cacheHit, true);
assert.strictEqual(data.matryoshkaEngine.reEmbeddingRequired, false);

console.log('✅ Matryoshka Agentic Memory Engine unit test passed.\n');
