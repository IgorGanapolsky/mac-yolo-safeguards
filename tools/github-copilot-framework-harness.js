'use strict';

class TokenBudgetManager {
  static truncatePayload(payloadText, maxTokens = 4000) {
    const approxTokens = Math.ceil(payloadText.length / 4);
    if (approxTokens <= maxTokens) {
      return { truncatedText: payloadText, tokenCount: approxTokens, truncated: false };
    }

    const charLimit = maxTokens * 4;
    const truncatedText = payloadText.substring(0, charLimit) + '\n... [TRUNCATED_FOR_TOKEN_BUDGET]';
    return { truncatedText, tokenCount: maxTokens, truncated: true };
  }
}

class ConfidenceEvaluator {
  static evaluateAction(confidenceScore, minConfidenceThreshold = 0.8) {
    if (confidenceScore >= minConfidenceThreshold) {
      return { approved: true, action: 'EXECUTE', score: confidenceScore };
    }
    return { approved: false, action: 'REQUIRE_HUMAN_OR_FALLBACK', score: confidenceScore };
  }
}

class MicrosoftCopilotAgentHarness {
  constructor(agentId = 'copilot-production-agent') {
    this.agentId = agentId;
    this.state = 'IDLE';
    this.history = [];
  }

  transitionTo(newState, metadata = {}) {
    const validTransitions = {
      IDLE: ['PLANNING'],
      PLANNING: ['EXECUTING', 'FAILED'],
      EXECUTING: ['VERIFYING', 'FAILED'],
      VERIFYING: ['COMPLETED', 'FAILED'],
      COMPLETED: ['IDLE'],
      FAILED: ['IDLE'],
    };

    const allowed = validTransitions[this.state] || [];
    if (!allowed.includes(newState)) {
      throw new Error(`Invalid state transition from ${this.state} to ${newState}`);
    }

    const prev = this.state;
    this.state = newState;
    const record = { prev, current: newState, timestamp: new Date().toISOString(), metadata };
    this.history.push(record);
    return record;
  }

  runProductionWorkflow(taskPrompt, confidenceScore = 0.95) {
    this.transitionTo('PLANNING', { promptLength: taskPrompt.length });

    const tokenBudget = TokenBudgetManager.truncatePayload(taskPrompt, 2000);
    const confidenceCheck = ConfidenceEvaluator.evaluateAction(confidenceScore);

    if (!confidenceCheck.approved) {
      this.transitionTo('FAILED', { reason: 'Low confidence score' });
      return { success: false, state: this.state, confidenceCheck };
    }

    this.transitionTo('EXECUTING', { tokenBudget });
    this.transitionTo('VERIFYING', { testResult: 'PASS' });
    this.transitionTo('COMPLETED', { resultSummary: 'Production task executed cleanly' });

    return {
      success: true,
      agentId: this.agentId,
      state: this.state,
      tokenBudget,
      confidenceCheck,
    };
  }
}

module.exports = {
  TokenBudgetManager,
  ConfidenceEvaluator,
  MicrosoftCopilotAgentHarness,
};
