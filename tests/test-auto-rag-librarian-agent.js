#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { AutoRagLibrarianAgent } = require('../tools/auto-rag-librarian-agent');

console.log('=== Testing Auto-RAG Self-Evolving Librarian Agent ===');

const agent = new AutoRagLibrarianAgent();

// 1. Test Query Expansion & Rewriting
const rewritten = agent.rewriteQuery('yolo verification tests');
assert.strictEqual(Array.isArray(rewritten), true);
assert.ok(rewritten.length >= 2);
assert.ok(rewritten.some((q) => q.includes('seed-yolo')));
console.log('✓ Multi-hop query expansion test passed');

// 2. Test Document Curation & Deduplication
const rawDocs = [
  'seed-yolo autonomous engine integration test',
  'scripts/verify.sh regression suite',
  'seed-yolo autonomous engine integration test', // Duplicate
];
const curation = agent.curateAndDeduplicate(rawDocs);
assert.strictEqual(curation.originalCount, 3);
assert.strictEqual(curation.curatedCount, 2);
console.log('✓ Document curation & deduplication test passed');

// 3. Test Full Auto-Search & Relevance Scoring
const result = agent.autoSearchAndCurate('yolo verification', () => rawDocs);
assert.strictEqual(typeof result.nDcgRelevanceScore, 'number');
assert.strictEqual(result.curatedDocsCount, 2);
assert.ok(result.nDcgRelevanceScore > 0.0);
console.log('✓ Full Auto-RAG search & nDCG relevance scoring test passed');

console.log('✅ Auto-RAG Self-Evolving Librarian Agent Unit Tests PASSED!');
