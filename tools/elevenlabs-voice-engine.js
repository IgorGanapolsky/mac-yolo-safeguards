'use strict';

/**
 * ElevenLabs Conversational Voice Agent & ThumbGate Governance Suite.
 * Node.js bridge for Voice-Agent-as-Code GitOps, Multi-LLM Cost Estimation,
 * Conversational Simulation, and ThumbGate Pre-Action Interdiction.
 */

const MODEL_PRICING = {
  'gemini-2.5-flash': {
    provider: 'Google',
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
    avgTtftMs: 140,
    recommendedFor: 'Ultra-low latency real-time voice',
  },
  'qwen-2.5-72b': {
    provider: 'Alibaba ModelStudio',
    inputPerMillion: 0.12,
    outputPerMillion: 0.24,
    avgTtftMs: 180,
    recommendedFor: 'High ROI Token Plan promo tier',
  },
  'glm-5.3': {
    provider: 'Zhipu AI',
    inputPerMillion: 0.10,
    outputPerMillion: 0.20,
    avgTtftMs: 190,
    recommendedFor: 'Zero marginal spend coding plan tier',
  },
  'gpt-4o-mini': {
    provider: 'OpenAI',
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
    avgTtftMs: 220,
    recommendedFor: 'Lightweight conversational tasks',
  },
  'gpt-4o': {
    provider: 'OpenAI',
    inputPerMillion: 2.50,
    outputPerMillion: 10.00,
    avgTtftMs: 380,
    recommendedFor: 'Complex reasoning / enterprise escalation',
  },
  'claude-3-5-sonnet': {
    provider: 'Anthropic',
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    avgTtftMs: 420,
    recommendedFor: 'Deep context reasoning / code diagnosis',
  },
};

const DEFAULT_VOICE_AGENT_TEMPLATE = {
  agentId: 'hermes_voice_receptionist_v1',
  name: 'Hermes Mobile Voice Receptionist',
  version: '1.0.0',
  conversationConfig: {
    agent: {
      prompt: {
        prompt:
          'You are Hermes, a helpful, ultra-concise voice assistant. ' +
          'Always reply in 1-2 spoken sentences. If a risky command is requested, ' +
          'instruct the caller to confirm on their phone screen.',
        llm: 'gemini-2.5-flash',
        temperature: 0.3,
        maxTokens: 150,
      },
      firstMessage: 'Hello! I am Hermes. What can I help you with today?',
      language: 'en',
    },
    tts: {
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      modelId: 'eleven_turbo_v2_5',
      stability: 0.5,
      similarityBoost: 0.8,
      latencyOptimization: 3,
    },
    safetyGuardrails: {
      requireSimulationTestPass: true,
      maxCostPerConversationUsd: 0.05,
      blockDestructiveDeletions: true,
    },
  },
};

function calculateConversationCosts({
  numConversations = 100,
  avgMinutesPerConv = 3.0,
  turnsPerMinute = 4,
  avgInputTokensPerTurn = 350,
  avgOutputTokensPerTurn = 60,
  ttsCostPerMinute = 0.04,
} = {}) {
  const totalTurns = Math.floor(numConversations * avgMinutesPerConv * turnsPerMinute);
  const totalMinutes = numConversations * avgMinutesPerConv;
  const totalTtsCost = totalMinutes * ttsCostPerMinute;

  const models = Object.entries(MODEL_PRICING).map(([modelName, specs]) => {
    const totalInputTokens = totalTurns * avgInputTokensPerTurn;
    const totalOutputTokens = totalTurns * avgOutputTokensPerTurn;

    const llmInputCost = (totalInputTokens / 1_000_000) * specs.inputPerMillion;
    const llmOutputCost = (totalOutputTokens / 1_000_000) * specs.outputPerMillion;
    const totalLlmCost = llmInputCost + llmOutputCost;
    const totalAllInCost = totalLlmCost + totalTtsCost;

    return {
      model: modelName,
      provider: specs.provider,
      avgTtftMs: specs.avgTtftMs,
      llmCostUsd: Number(totalLlmCost.toFixed(4)),
      ttsCostUsd: Number(totalTtsCost.toFixed(4)),
      totalCostUsd: Number(totalAllInCost.toFixed(4)),
      costPerConversationUsd: Number((totalAllInCost / Math.max(1, numConversations)).toFixed(4)),
      costPerMinuteUsd: Number((totalAllInCost / Math.max(1, totalMinutes)).toFixed(4)),
      recommendedFor: specs.recommendedFor,
    };
  });

  models.sort((a, b) => a.totalCostUsd - b.totalCostUsd);
  const cheapest = models[0];
  const mostExpensive = models[models.length - 1];
  const savingsPercent = Number(
    (
      ((mostExpensive.totalCostUsd - cheapest.totalCostUsd) / mostExpensive.totalCostUsd) *
      100
    ).toFixed(1)
  );

  return {
    parameters: {
      numConversations,
      avgMinutesPerConv,
      totalMinutes,
      totalTurns,
      ttsCostPerMinute,
    },
    models,
    analysis: {
      cheapestModel: cheapest.model,
      cheapestTotalUsd: cheapest.totalCostUsd,
      flagshipModel: mostExpensive.model,
      flagshipTotalUsd: mostExpensive.totalCostUsd,
      maxSavingsPercent: savingsPercent,
    },
  };
}

function simulateConversationTest(config = DEFAULT_VOICE_AGENT_TEMPLATE) {
  const agentCfg = config?.conversationConfig?.agent || {};
  const promptCfg = agentCfg?.prompt || {};
  const prompt = promptCfg?.prompt || '';
  const llm = promptCfg?.llm || '';
  const firstMessage = agentCfg?.firstMessage || '';

  const testCases = [
    {
      name: 'Initial Greeting Test',
      passed: firstMessage.trim().length > 0,
      details: `Greeting is non-empty: "${firstMessage.slice(0, 40)}..."`,
    },
    {
      name: 'LLM Selection Validity',
      passed: Boolean(MODEL_PRICING[llm]),
      details: `Model "${llm}" is recognized in safety pricing catalog.`,
    },
    {
      name: 'Conciseness & Latency Constraint',
      passed:
        prompt.toLowerCase().includes('concise') ||
        prompt.toLowerCase().includes('short') ||
        prompt.toLowerCase().includes('sentences'),
      details: 'Prompt contains spoken voice conciseness directives.',
    },
    {
      name: 'Safety Escalation Directive',
      passed:
        prompt.toLowerCase().includes('confirm') ||
        prompt.toLowerCase().includes('phone') ||
        prompt.toLowerCase().includes('safety') ||
        prompt.toLowerCase().includes('screen'),
      details: 'Prompt includes operator phone confirmation instruction for risky actions.',
    },
  ];

  const allPassed = testCases.every((tc) => tc.passed);
  return {
    status: allPassed ? 'PASS' : 'FAIL',
    agentId: config.agentId || 'unknown',
    testsRun: testCases.length,
    testsPassed: testCases.filter((tc) => tc.passed).length,
    testCases,
  };
}

function evaluateThumbgatePreAction({
  action,
  agentId,
  hasSimulatedPass = false,
  isOperatorApproved = false,
  estimatedCostUsd = 0.0,
  costCeilingUsd = 0.05,
}) {
  const destructiveActions = ['delete_agent', 'remove_agent', 'destroy_workspace'];
  const mutationActions = ['update_prompt', 'modify_system_prompt', 'swap_model', 'update_agent'];

  if (destructiveActions.includes(action)) {
    if (!isOperatorApproved) {
      return {
        decision: 'BLOCK',
        action,
        agentId,
        reason: 'Destructive voice agent deletion requires explicit phone Leash operator approval.',
        interventionType: 'HUMAN_LEASH_REQUIRED',
      };
    }
    return {
      decision: 'ALLOW',
      action,
      agentId,
      reason: 'Operator Leash approval verified for agent deletion.',
    };
  }

  if (mutationActions.includes(action)) {
    if (!hasSimulatedPass) {
      return {
        decision: 'BLOCK',
        action,
        agentId,
        reason: 'Voice agent configuration changes require a passing conversational simulation test before deployment.',
        interventionType: 'SIMULATION_TEST_REQUIRED',
      };
    }
    if (estimatedCostUsd > costCeilingUsd && !isOperatorApproved) {
      return {
        decision: 'BLOCK',
        action,
        agentId,
        reason: `Estimated conversation cost ($${estimatedCostUsd.toFixed(4)}) exceeds safety ceiling ($${costCeilingUsd.toFixed(4)}). Operator approval required.`,
        interventionType: 'COST_CEILING_EXCEEDED',
      };
    }
    return {
      decision: 'ALLOW',
      action,
      agentId,
      reason: 'Simulation tests passed and cost is within safety threshold.',
    };
  }

  return {
    decision: 'ALLOW',
    action,
    agentId,
    reason: 'Read-only voice agent inspection is safe.',
  };
}

module.exports = {
  MODEL_PRICING,
  DEFAULT_VOICE_AGENT_TEMPLATE,
  calculateConversationCosts,
  simulateConversationTest,
  evaluateThumbgatePreAction,
};
