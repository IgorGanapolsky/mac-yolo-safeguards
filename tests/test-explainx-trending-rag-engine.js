'use strict';

const assert = require('assert');
const { ExplainxTrendingRagEngine } = require('../tools/explainx-trending-rag-engine');

async function runTests() {
  console.log('=== Running ExplainX Trending Ingestor & Agentic RAG Optimization Tests ===\n');

  const engine = new ExplainxTrendingRagEngine();

  // 1. Data Science Tokenization Test
  const tokens = engine.tokenize('The MCP Action Gateway enforces Pre-Action Guardrails and Security!');
  assert.ok(tokens.includes('mcp'));
  assert.ok(tokens.includes('action'));
  assert.ok(tokens.includes('gateway'));
  assert.ok(tokens.includes('guardrails'));
  assert.ok(!tokens.includes('the')); // Stopword filtered
  assert.ok(!tokens.includes('and')); // Stopword filtered
  console.log('PASS [1/4]: Text Tokenization & Stopword Filtering');

  // 2. ML TF-IDF Vectorization & Cosine Similarity Test
  const docs = [
    { id: 'd1', text: 'fenced vps cloud runner execution' },
    { id: 'd2', text: 'fenced vps autonomous coding agent' },
    { id: 'd3', text: 'unrelated recipe for chocolate cookies' },
  ];
  const vectorized = engine.computeTfIdf(docs);
  assert.strictEqual(vectorized.length, 3);
  assert.ok(Object.keys(vectorized[0].vector).length > 0);

  const sim12 = engine.cosineSimilarity(vectorized[0].vector, vectorized[1].vector);
  const sim13 = engine.cosineSimilarity(vectorized[0].vector, vectorized[2].vector);
  assert.ok(sim12 > 0.2, 'Similar documents have high cosine similarity');
  assert.strictEqual(sim13, 0.0, 'Orthogonal documents have 0 cosine similarity');
  console.log('PASS [2/4]: TF-IDF Vectorization & Cosine Similarity');

  // 3. Trending Ingestion & ROI Ranking Test
  const report = await engine.analyzeAndOptimize();
  assert.ok(report.itemsAnalyzed >= 5, 'Ingested 5+ trending items');
  assert.ok(report.topOptimizations.length > 0, 'Top optimizations generated');
  assert.ok(report.topOptimizations[0].roiScore > 0, 'ROI score calculated');
  assert.ok(report.topOptimizations[0].strategicAction.length > 10, 'Actionable strategy formulated');
  console.log('PASS [3/4]: Multi-Item Ingestion & ROI Scoring');

  // 4. Persistence & Audit Receipt Test
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const receiptPath = path.join(os.homedir(), '.hermes', 'receipts', 'explainx-trending', 'latest.json');
  assert.ok(fs.existsSync(receiptPath), 'Latest report persisted');
  const saved = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.strictEqual(saved.itemsAnalyzed, report.itemsAnalyzed);
  console.log('PASS [4/4]: Receipt Persistence & Auditability');

  console.log('\n=== All 4 ExplainX Trending RAG Tests Passed (100% Green) ===');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
