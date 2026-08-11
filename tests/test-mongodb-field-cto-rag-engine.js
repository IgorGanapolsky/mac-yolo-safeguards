'use strict';

const assert = require('assert');
const {
  HybridVectorReranker,
  AgenticSemanticCache,
  RetrievalQualityEvaluator,
} = require('../tools/mongodb-field-cto-rag-engine');

console.log('=== Testing MongoDB Field CTO (Pete Johnson) Architectural RAG Engine ===');

// 1. Test Native Reranker
const candidates = [
  { id: 'doc1', content: 'seed-yolo permissions executable mode 755', vectorSimilarity: 0.7 },
  { id: 'doc2', content: 'unrelated postgresql database index tuning', vectorSimilarity: 0.9 },
  { id: 'doc3', content: 'executable perm fix for seed-yolo wrapper', vectorSimilarity: 0.85 },
];

const reranked = HybridVectorReranker.rerankCandidates(candidates, 'seed-yolo executable perm fix', 2);
assert.strictEqual(reranked[0].id, 'doc3');
console.log(`  ✓ Native Reranking surfaced top relevant document: ${reranked[0].id} (score: ${reranked[0].rerankScore})`);

// 2. Test Agentic Semantic Cache
const cache = new AgenticSemanticCache();
cache.put('how to fix seed-yolo permission denied', 'Run chmod 755 on tools/seed-yolo-wrapper.js', 0.03);

const cacheResult = cache.get('how to fix seed-yolo permission denied');
assert.strictEqual(cacheResult.hit, true);
assert.strictEqual(cacheResult.cachedAnswer, 'Run chmod 755 on tools/seed-yolo-wrapper.js');
console.log(`  ✓ Semantic Agent Cache hit in ${cacheResult.latencyMs}ms (saved $${cacheResult.savedCost})`);

// 3. Test Retrieval Quality KPIs (Precision@K)
const kpi = RetrievalQualityEvaluator.evaluatePrecisionRecall(['doc3', 'doc1', 'doc2'], ['doc3', 'doc1'], 3);
assert.strictEqual(kpi.precisionAtK, 0.67);
assert.strictEqual(kpi.recallAtK, 1.0);
assert.strictEqual(kpi.qualityPass, true);
console.log(`  ✓ Retrieval Quality KPI Passed: Precision@3=${kpi.precisionAtK}, Recall@3=${kpi.recallAtK}`);

console.log('✅ MongoDB Field CTO Architectural RAG Engine Unit Tests PASSED!');
