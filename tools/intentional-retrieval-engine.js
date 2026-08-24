#!/usr/bin/env node
'use strict';

/**
 * Intentional Multi-Tenant Retrieval Engine & Provenance Tracker
 *
 * Implements DynamoDB/Vector production retrieval discipline:
 * 1. Multi-Tenant Document & Chunk Schema:
 *    - tenantId, documentId, chunkId, title, text, embedding, sourcePath, contentVersion, accessControl metadata.
 *
 * 2. Strict Tenant Isolation & Access-Control Filtering:
 *    - Only chunks matching the caller's tenantId and role permissions are visible for vector matching.
 *
 * 3. Provenance & Grounded Citations:
 *    - Every retrieved chunk preserves source URL/path, documentId, and chunkId for transparent citation.
 *
 * 4. Retrieval Evaluation Benchmarking:
 *    - Computes Recall@k, Precision@k, and Mean Reciprocal Rank (MRR) across evaluation query sets.
 *
 * 5. Query & Audit Telemetry:
 *    - Logs query, retrieved chunks, similarity scores, model version, and feedback (up/down).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Computes Cosine Similarity between two numeric vectors
 */
function cosineSimilarity(vecA = [], vecB = []) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Creates a standard vector document chunk
 */
function createDocumentChunk(data = {}) {
  const {
    tenantId = 'default_tenant',
    documentId = `doc_${Date.now()}`,
    chunkIndex = 0,
    title = 'Untitled Document',
    text = '',
    embedding = [],
    sourcePath = '/docs/internal',
    contentVersion = '1.0.0',
    accessControl = { rolesRequired: ['read_only'] },
  } = data;

  const chunkId = `${documentId}_chk_${chunkIndex}`;
  const sha256 = crypto.createHash('sha256').update(text).digest('hex');

  return {
    tenantId,
    documentId,
    chunkId,
    title,
    text,
    embedding,
    sourcePath,
    contentVersion,
    accessControl,
    sha256,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Intentional Vector Store & Retrieval Engine
 */
class IntentionalRetrievalEngine {
  constructor(options = {}) {
    this.chunks = [];
    this.auditLogs = [];
    this.options = options;
  }

  /**
   * Adds a document chunk into the index
   */
  addChunk(chunk) {
    this.chunks.push(chunk);
  }

  /**
   * Performs intentional, tenant-gated vector retrieval
   */
  retrieve(queryVector, callerContext = {}, options = {}) {
    const { tenantId = 'default_tenant', userRoles = ['read_only'] } = callerContext;
    const topK = options.topK || 3;
    const minScore = options.minScore || 0.1;

    // 1. Multi-tenant and access control filtering
    const eligibleChunks = this.chunks.filter((chunk) => {
      if (chunk.tenantId !== tenantId) return false;

      // Access control check
      const requiredRoles = chunk.accessControl?.rolesRequired || ['read_only'];
      const hasRole =
        requiredRoles.includes('read_only') ||
        requiredRoles.some((role) => userRoles.includes(role) || userRoles.includes('admin'));
      return hasRole;
    });

    // 2. Similarity scoring
    const scored = eligibleChunks.map((chunk) => {
      const score = cosineSimilarity(queryVector, chunk.embedding);
      return {
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        title: chunk.title,
        text: chunk.text,
        sourcePath: chunk.sourcePath,
        contentVersion: chunk.contentVersion,
        score,
      };
    });

    // 3. Rank and filter top-k
    scored.sort((a, b) => b.score - a.score);
    const results = scored.filter((r) => r.score >= minScore).slice(0, topK);

    // 4. Audit logging
    const queryLog = {
      logId: `qlog_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      tenantId,
      retrievedChunkIds: results.map((r) => r.chunkId),
      scores: results.map((r) => Number(r.score.toFixed(4))),
      topK,
      userFeedback: null,
    };
    this.auditLogs.push(queryLog);

    return {
      results,
      queryLogId: queryLog.logId,
      totalEligibleChunks: eligibleChunks.length,
    };
  }

  /**
   * Attaches user feedback to a query log
   */
  recordFeedback(queryLogId, signal = 'up', note = '') {
    const log = this.auditLogs.find((l) => l.logId === queryLogId);
    if (log) {
      log.userFeedback = {
        signal: signal === 'up' ? 'up' : 'down',
        note: note || '',
        recordedAt: new Date().toISOString(),
      };
      return true;
    }
    return false;
  }

  /**
   * Evaluates retrieval quality against an evaluation set
   */
  evaluateBenchmark(evalSet = [], callerContext = {}, topK = 3) {
    if (!Array.isArray(evalSet) || evalSet.length === 0) {
      return { totalQueries: 0, recallAtK: 0, precisionAtK: 0, mrr: 0 };
    }

    let totalRecallHits = 0;
    let totalExpectedChunks = 0;
    let totalRetrievedHits = 0;
    let sumReciprocalRank = 0;

    for (const testCase of evalSet) {
      const { queryVector, expectedChunkIds = [] } = testCase;
      totalExpectedChunks += expectedChunkIds.length;

      const retrieval = this.retrieve(queryVector, callerContext, { topK });
      const retrievedIds = retrieval.results.map((r) => r.chunkId);

      // Recall & Precision
      let hits = 0;
      let firstHitRank = 0;

      retrievedIds.forEach((id, idx) => {
        if (expectedChunkIds.includes(id)) {
          hits++;
          if (firstHitRank === 0) {
            firstHitRank = idx + 1;
          }
        }
      });

      totalRecallHits += hits;
      totalRetrievedHits += hits;

      if (firstHitRank > 0) {
        sumReciprocalRank += 1 / firstHitRank;
      }
    }

    const totalEvaluated = evalSet.length;
    const recallAtK = totalExpectedChunks > 0 ? totalRecallHits / totalExpectedChunks : 0;
    const precisionAtK = totalEvaluated * topK > 0 ? totalRetrievedHits / (totalEvaluated * topK) : 0;
    const mrr = totalEvaluated > 0 ? sumReciprocalRank / totalEvaluated : 0;

    return {
      totalQueries: totalEvaluated,
      topK,
      recallAtK: Number(recallAtK.toFixed(4)),
      precisionAtK: Number(precisionAtK.toFixed(4)),
      mrr: Number(mrr.toFixed(4)),
      passedThreshold: recallAtK >= 0.70 && mrr >= 0.60,
    };
  }
}

module.exports = {
  cosineSimilarity,
  createDocumentChunk,
  IntentionalRetrievalEngine,
};

if (require.main === module) {
  console.log('--- Intentional Multi-Tenant Retrieval Engine ---');
  const engine = new IntentionalRetrievalEngine();
  const chunk1 = createDocumentChunk({
    tenantId: 'tenant_alpha',
    documentId: 'doc_runbook_nginx',
    chunkIndex: 0,
    title: 'Nginx Graceful Restart Runbook',
    text: 'Run sudo systemctl reload nginx to reload configuration without dropping client connections.',
    embedding: [0.8, 0.6, 0.0],
  });
  engine.addChunk(chunk1);

  const res = engine.retrieve([0.82, 0.58, 0.0], { tenantId: 'tenant_alpha', userRoles: ['read_only'] });
  console.log(`Retrieved ${res.results.length} chunks. Top score: ${res.results[0]?.score.toFixed(3)}`);
}
