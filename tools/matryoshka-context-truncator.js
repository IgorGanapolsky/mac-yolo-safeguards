'use strict';

/**
 * Matryoshka Context Truncator (MRL RAG Optimization)
 * Inspired by Super Data Science #1017 & Matryoshka Representation Learning.
 * 
 * Slices high-dimensional embeddings (768d/1024d) into progressive prefix dimensions:
 * - 64d: Ultra-fast candidate filtering (<1ms)
 * - 256d: Medium precision candidate pruning
 * - Full-dim (768d/1024d): Exact top-k re-ranking
 */

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function truncateEmbedding(embedding, targetDim = 64) {
  if (!Array.isArray(embedding)) return [];
  const sliced = embedding.slice(0, targetDim);
  // Normalize truncated vector
  let norm = 0;
  for (let i = 0; i < sliced.length; i++) {
    norm += sliced[i] * sliced[i];
  }
  const length = Math.sqrt(norm);
  if (length === 0) return sliced;
  return sliced.map(v => v / length);
}

function matryoshkaRerank(queryEmbedding, documentItems, options = {}) {
  const coarseDim = options.coarseDim || 64;
  const fineDim = options.fineDim || queryEmbedding.length;
  const topKCoarse = options.topKCoarse || 10;
  const topKFine = options.topKFine || 3;

  if (!Array.isArray(documentItems) || documentItems.length === 0) {
    return [];
  }

  // Step 1: Ultra-fast coarse filtering using coarseDim prefix
  const coarseQuery = truncateEmbedding(queryEmbedding, coarseDim);
  const coarseScored = documentItems.map((doc, index) => {
    const docCoarse = doc.coarseVector || truncateEmbedding(doc.vector || [], coarseDim);
    const score = cosineSimilarity(coarseQuery, docCoarse);
    return { doc, score, index };
  });

  coarseScored.sort((a, b) => b.score - a.score);
  const candidatePool = coarseScored.slice(0, topKCoarse);

  // Step 2: High-precision fine re-ranking using full dimensions
  const fineQuery = queryEmbedding;
  const fineScored = candidatePool.map(item => {
    const docVector = item.doc.vector || [];
    const score = cosineSimilarity(fineQuery, docVector);
    return { doc: item.doc, score, coarseScore: item.score };
  });

  fineScored.sort((a, b) => b.score - a.score);
  return fineScored.slice(0, topKFine);
}

module.exports = {
  cosineSimilarity,
  truncateEmbedding,
  matryoshkaRerank,
};
