'use strict';

const assert = require('assert');
const {
  cosineSimilarity,
  truncateEmbedding,
  matryoshkaRerank,
} = require('../tools/matryoshka-context-truncator');

console.log('=== Testing Matryoshka Context Truncator ===');

// 1. Vector normalization & similarity tests
const v1 = [1, 0, 0, 0];
const v2 = [1, 0, 0, 0];
assert.strictEqual(Math.round(cosineSimilarity(v1, v2) * 1000) / 1000, 1.0);

const v3 = [0, 1, 0, 0];
assert.strictEqual(cosineSimilarity(v1, v3), 0.0);

// 2. Truncation test
const fullVec = [0.6, 0.8, 0.5, 0.2, 0.1];
const truncated = truncateEmbedding(fullVec, 2);
assert.strictEqual(truncated.length, 2);
const norm = Math.sqrt(truncated[0] * truncated[0] + truncated[1] * truncated[1]);
assert(Math.abs(norm - 1.0) < 0.0001);

// 3. Matryoshka Reranking Test
const query = [0.9, 0.1, 0.05, 0.02, 0.8, 0.1, 0.2, 0.3];
const docs = [
  { id: 'doc1', vector: [0.89, 0.11, 0.04, 0.01, 0.79, 0.09, 0.21, 0.29], title: 'Relevant Document 1' },
  { id: 'doc2', vector: [0.1, 0.9, 0.8, 0.7, 0.1, 0.2, 0.3, 0.4], title: 'Irrelevant Document 2' },
  { id: 'doc3', vector: [0.88, 0.12, 0.06, 0.03, 0.81, 0.1, 0.19, 0.31], title: 'Relevant Document 3' },
];

const results = matryoshkaRerank(query, docs, { coarseDim: 2, topKCoarse: 2, topKFine: 2 });
assert.strictEqual(results.length, 2);
assert(results[0].doc.id === 'doc1' || results[0].doc.id === 'doc3');
assert(results[1].doc.id === 'doc1' || results[1].doc.id === 'doc3');

console.log('✅ Matryoshka Context Truncator Tests PASSED!');
