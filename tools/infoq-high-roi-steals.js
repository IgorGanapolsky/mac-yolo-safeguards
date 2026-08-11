'use strict';

/**
 * InfoQ High-ROI Steals Engine (August 2026 Industry Architecture Benchmark)
 * Inspired by InfoQ August 11, 2026 Architecture Digest:
 * 
 * 1. Context Infrastructure Evaluator (Tacnode Infrastructure Pattern)
 * 2. State-Machine Remediation Harness (Stripe Graph + State Machine Pattern)
 * 3. Runtime-Agnostic Fast-Eval Engine (Spotify Honk + Production Durability Pattern)
 * 4. Over-Building Benchmark Auditor (Ponytail Agent Skill Pattern)
 */

const fs = require('fs');
const path = require('path');

// 1. Context Infrastructure Evaluator
function evaluateContextInfrastructure(contextConfig = {}) {
  const tokenBudget = contextConfig.tokenBudget || 65536;
  const currentTokens = contextConfig.currentTokens || 12000;
  const fragmentationScore = contextConfig.fragmentationScore || 0.15;

  const utilizationRatio = currentTokens / tokenBudget;
  const isHealthy = utilizationRatio <= 0.75 && fragmentationScore <= 0.30;

  return {
    utilizationRatio: Math.round(utilizationRatio * 100) / 100,
    fragmentationScore,
    status: isHealthy ? 'OPTIMAL' : 'FRAGMENTED_REQUIRES_COMPACTION',
    recommendedAction: isHealthy ? 'PROCEED' : 'COMPACT_CONTEXT_PACK',
  };
}

// 2. State-Machine Remediation Harness (Stripe Remediation Pattern)
const FAILURE_STATES = Object.freeze({
  HEALTHY: 'HEALTHY',
  AUTH_REJECTED: 'AUTH_REJECTED',
  CONTEXT_CEILING: 'CONTEXT_CEILING',
  OLLAMA_COLDSTART: 'OLLAMA_COLDSTART',
  RATE_LIMITED: 'RATE_LIMITED',
});

function resolveRemediationTransition(currentState, errorEvent = {}) {
  const code = errorEvent.code || errorEvent.status || '';
  const message = String(errorEvent.message || '').toLowerCase();

  if (code === 401 || message.includes('auth') || message.includes('refresh token')) {
    return {
      nextState: FAILURE_STATES.AUTH_REJECTED,
      remediation: 'AUTO_SWITCH_PROVIDER_TO_OPENAI',
      actionCode: 'RETRY_WITH_OPENAI',
    };
  }

  if (message.includes('context') || message.includes('compacting') || message.includes('limit')) {
    return {
      nextState: FAILURE_STATES.CONTEXT_CEILING,
      remediation: 'TRIGGER_LEAN_CONTEXT_RESET',
      actionCode: 'TRUNCATE_CONVERSATION_HISTORY',
    };
  }

  if (message.includes('socket') || message.includes('econnrefused') || message.includes('timeout')) {
    return {
      nextState: FAILURE_STATES.OLLAMA_COLDSTART,
      remediation: 'SWITCH_TO_IPV4_SOCKET_WITH_120S_TIMEOUT',
      actionCode: 'RETRY_LOCAL_SOCKET',
    };
  }

  return {
    nextState: FAILURE_STATES.HEALTHY,
    remediation: 'NO_ACTION_REQUIRED',
    actionCode: 'PASS',
  };
}

// 3. Runtime-Agnostic Fast-Eval Engine (Spotify Honk Pattern)
function runFastEvalProbe(llmOutput, rules = []) {
  if (!llmOutput || typeof llmOutput !== 'string') {
    return { pass: false, score: 0, violations: ['EMPTY_OUTPUT'] };
  }

  const violations = [];
  const text = llmOutput.toLowerCase();

  // Check anti-bot slop rules
  if (text.includes('open prs:') || text.includes('compacting context') || text.includes('noting that and moving')) {
    violations.push('BOT_SLOP_META_COMMENTARY');
  }

  if (text.includes('as an ai') || text.includes('i am an ai')) {
    violations.push('AI_SELF_IDENTIFICATION');
  }

  const pass = violations.length === 0;
  const score = pass ? 1.0 : Math.max(0, 1.0 - violations.length * 0.4);

  return {
    pass,
    score: Math.round(score * 100) / 100,
    violations,
  };
}

// 4. Over-Building Benchmark Auditor (Ponytail Pattern)
function auditOverBuilding(proposedDiff = '', baselineLines = 100) {
  const additions = (proposedDiff.match(/^\+[^+]/gm) || []).length;
  const deletions = (proposedDiff.match(/^-[^-]/gm) || []).length;
  const netChange = additions - deletions;

  const codeReductionRatio = baselineLines > 0 ? (deletions / baselineLines) : 0;
  const isOverbuilding = additions > 250 && deletions < 10;

  return {
    additions,
    deletions,
    netChange,
    codeReductionRatio: Math.round(codeReductionRatio * 100) / 100,
    isOverbuilding,
    recommendation: isOverbuilding ? 'REJECT_OVERBUILDING_SIMPLIFY' : 'PASS_LEAN_DIFF',
  };
}

module.exports = {
  evaluateContextInfrastructure,
  resolveRemediationTransition,
  runFastEvalProbe,
  auditOverBuilding,
  FAILURE_STATES,
};
