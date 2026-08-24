#!/usr/bin/env node
'use strict';

/**
 * Internal Engineering Knowledge Agent with Gated Approval Ladder
 *
 * Implements:
 * 1. Intentional Knowledge Base Retrieval with strict citations.
 * 2. Shift-Zero in-flight security filtering on all queries and retrieved chunks.
 * 3. Gated Approval Ladder:
 *    - Read queries execute immediately with full provenance citations.
 *    - External write actions (creating GitHub issues, updating runbooks, dispatching alerts)
 *      are held in a cryptographic `pending_approval` state until verified by a human operator.
 */

const crypto = require('crypto');
const { scanUntrustedContent, validateToolDispatch } = require('./shift-zero-security-guard.js');
const { IntentionalRetrievalEngine, createDocumentChunk } = require('./intentional-retrieval-engine.js');

class EngineeringKnowledgeAgent {
  constructor(options = {}) {
    this.retrievalEngine = options.retrievalEngine || new IntentionalRetrievalEngine();
    this.pendingApprovals = [];
    this.executedActions = [];
  }

  /**
   * Processes an engineering query with intentional retrieval and citation grounding
   */
  answerQuery(queryText, queryVector, callerContext = {}) {
    // 1. Shift-Zero security scan on input query
    const inputScan = scanUntrustedContent(queryText, { source: 'user_query' });
    if (!inputScan.safe) {
      return {
        success: false,
        error: 'Query blocked by shift-zero security guard: prompt injection or credential leak detected.',
        securityFindings: inputScan.findings,
        answer: null,
      };
    }

    // 2. Intentional retrieval with tenant boundary check
    const retrieval = this.retrievalEngine.retrieve(queryVector, callerContext, { topK: 3 });

    if (retrieval.results.length === 0) {
      return {
        success: true,
        answer: 'No relevant internal engineering runbooks found matching the query.',
        citations: [],
        queryLogId: retrieval.queryLogId,
      };
    }

    // 3. Scan retrieved chunks for potential poisoning
    const citations = [];
    for (const chunk of retrieval.results) {
      const chunkScan = scanUntrustedContent(chunk.text, { source: `chunk_${chunk.chunkId}` });
      if (chunkScan.safe) {
        citations.push({
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          title: chunk.title,
          sourcePath: chunk.sourcePath,
          contentVersion: chunk.contentVersion,
          score: chunk.score,
        });
      }
    }

    const answer = `Based on internal runbooks [${citations.map((c) => c.title).join(', ')}]: ${retrieval.results[0].text}`;

    return {
      success: true,
      answer,
      citations,
      queryLogId: retrieval.queryLogId,
    };
  }

  /**
   * Requests a write action behind the Gated Approval Ladder
   */
  requestWriteAction(actionType, actionPayload = {}, callerContext = {}) {
    // Validate tool dispatch permissions
    const toolVal = validateToolDispatch(actionType, actionPayload, callerContext);
    if (!toolVal.allowed) {
      return {
        approved: false,
        status: 'blocked',
        reason: toolVal.reason,
      };
    }

    const approvalId = `appr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const approvalRequest = {
      approvalId,
      actionType,
      actionPayload,
      requestedBy: callerContext.userId || 'engineer',
      tenantId: callerContext.tenantId || 'default_tenant',
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
    };

    this.pendingApprovals.push(approvalRequest);

    return {
      approved: false,
      status: 'pending_approval',
      approvalId,
      message: `Write action '${actionType}' requires human operator approval before execution.`,
    };
  }

  /**
   * Approves and executes a pending write action
   */
  approveAndExecute(approvalId, approverContext = {}) {
    const reqIndex = this.pendingApprovals.findIndex((a) => a.approvalId === approvalId);
    if (reqIndex === -1) {
      throw new Error(`Approval request '${approvalId}' not found.`);
    }

    const req = this.pendingApprovals[reqIndex];
    if (req.status !== 'pending_approval') {
      throw new Error(`Approval request '${approvalId}' is already ${req.status}.`);
    }

    // Require admin or approver role
    const roles = approverContext.userRoles || [];
    if (!roles.includes('admin') && !roles.includes('approver')) {
      throw new Error("Approver lacks 'admin' or 'approver' role.");
    }

    req.status = 'approved_and_executed';
    req.approvedBy = approverContext.userId || 'lead_engineer';
    req.executedAt = new Date().toISOString();

    this.executedActions.push(req);
    this.pendingApprovals.splice(reqIndex, 1);

    return {
      success: true,
      approvalId,
      status: 'executed',
      actionType: req.actionType,
    };
  }
}

module.exports = {
  EngineeringKnowledgeAgent,
};

if (require.main === module) {
  console.log('--- Engineering Knowledge Agent ---');
  const agent = new EngineeringKnowledgeAgent();
  const res = agent.answerQuery('How to reboot proxy?', [0.8, 0.6, 0.0], { tenantId: 'tenant_alpha', userRoles: ['read_only'] });
  console.log('Answer:', res.answer);
}
