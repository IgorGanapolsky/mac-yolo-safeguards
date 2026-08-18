'use strict';

/**
 * ElevenLabs Conversational Voice Agent & ThumbGate Governance Suite (JS).
 * Mirrors the Python CLI engine for Node tests / CI.
 */

const MODEL_PRICING = {
  'gemini-2.5-flash': {
    provider: 'Google',
    inputPerMillion: 0.075,
    outputPerMillion: 0.3,
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
    inputPerMillion: 0.1,
    outputPerMillion: 0.2,
    avgTtftMs: 190,
    recommendedFor: 'Zero marginal spend coding plan tier',
  },
  'gpt-4o-mini': {
    provider: 'OpenAI',
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    avgTtftMs: 220,
    recommendedFor: 'Lightweight conversational tasks',
  },
  'gpt-4o': {
    provider: 'OpenAI',
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
    avgTtftMs: 380,
    recommendedFor: 'Complex reasoning / enterprise escalation',
  },
  'claude-3-5-sonnet': {
    provider: 'Anthropic',
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    avgTtftMs: 420,
    recommendedFor: 'Deep context reasoning / code diagnosis',
  },
};

const BILLING_ESCALATION_MARKERS = [
  'billing',
  'dispute',
  'refund',
  'payment',
  'charge',
  'invoice',
];

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
          'instruct the caller to confirm on their phone screen. ' +
          'Escalate billing disputes and payment issues to a human operator — ' +
          'never invent refunds or charge outcomes.',
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
      maxCostPerConversationUsd: 0.20,
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

function compareModels({
  baseline = 'gpt-4o',
  candidate = 'gemini-2.5-flash',
  numConversations = 100,
  avgMinutesPerConv = 3.0,
} = {}) {
  if (!MODEL_PRICING[baseline]) {
    throw new Error(`Unknown baseline model: ${baseline}`);
  }
  if (!MODEL_PRICING[candidate]) {
    throw new Error(`Unknown candidate model: ${candidate}`);
  }
  const report = calculateConversationCosts({ numConversations, avgMinutesPerConv });
  const byModel = Object.fromEntries(report.models.map((m) => [m.model, m]));
  const base = byModel[baseline];
  const cand = byModel[candidate];
  const delta = Number((cand.costPerConversationUsd - base.costPerConversationUsd).toFixed(4));
  const pct =
    base.costPerConversationUsd > 0
      ? Number(((delta / base.costPerConversationUsd) * 100).toFixed(1))
      : 0;
  return {
    baseline: base,
    candidate: cand,
    deltaCostPerConversationUsd: delta,
    deltaPercentVsBaseline: pct,
    recommendation: delta < 0 ? `Prefer ${candidate}` : delta > 0 ? `Keep ${baseline}` : 'Cost-neutral',
    parameters: report.parameters,
  };
}

function hasBillingEscalation(prompt) {
  const lower = String(prompt || '').toLowerCase();
  const hasMarker = BILLING_ESCALATION_MARKERS.some((m) => lower.includes(m));
  const hasHuman = ['human', 'operator', 'escalate', 'transfer', 'person'].some((w) =>
    lower.includes(w)
  );
  return hasMarker && hasHuman;
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
      details: "Greeting is non-empty.",
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
    {
      name: 'Billing Dispute Escalation Retained',
      passed: hasBillingEscalation(prompt),
      details:
        'Prompt still escalates billing/payment disputes to a human (chat confirm alone is not validation).',
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
  costCeilingUsd = 0.20,
}) {
  const destructiveActions = ['delete_agent', 'remove_agent', 'destroy_workspace'];
  const mutationActions = [
    'update_prompt',
    'modify_system_prompt',
    'swap_model',
    'update_agent',
    'promote_config',
  ];

  if (destructiveActions.includes(action)) {
    if (!isOperatorApproved) {
      return {
        decision: 'BLOCK',
        action,
        agentId,
        reason:
          'Destructive voice agent deletion requires explicit phone Leash operator approval.',
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
        reason:
          'Voice agent configuration changes require a passing conversational simulation test before deployment.',
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

function promoteConfig(
  config = DEFAULT_VOICE_AGENT_TEMPLATE,
  {
    action = 'promote_config',
    isOperatorApproved = false,
    costCeilingUsd = null,
    dryRun = true,
  } = {}
) {
  const agentId = config.agentId || 'unknown';
  const llm = config?.conversationConfig?.agent?.prompt?.llm || 'gemini-2.5-flash';
  const guardrails = config?.conversationConfig?.safetyGuardrails || {};
  const ceiling =
    costCeilingUsd != null ? costCeilingUsd : Number(guardrails.maxCostPerConversationUsd ?? 0.20);

  const simulation = simulateConversationTest(config);
  const costs = calculateConversationCosts({ numConversations: 100, avgMinutesPerConv: 3.0 });
  const modelRow = costs.models.find((m) => m.model === llm);
  const estimated = modelRow ? modelRow.costPerConversationUsd : 999.0;

  const gate = evaluateThumbgatePreAction({
    action,
    agentId,
    hasSimulatedPass: simulation.status === 'PASS',
    isOperatorApproved,
    estimatedCostUsd: estimated,
    costCeilingUsd: ceiling,
  });

  const promotable = gate.decision === 'ALLOW' && simulation.status === 'PASS';
  return {
    promotedAt: new Date().toISOString(),
    dryRun,
    promotable,
    agentId,
    llm,
    estimatedCostPerConversationUsd: estimated,
    costCeilingUsd: ceiling,
    simulation,
    gate,
    deployAction: promotable ? (dryRun ? 'WOULD_PUSH_CONFIG' : 'PUSH_CONFIG') : 'HOLD',
    note: 'Chat confirmation is not validation — promote requires simulation PASS + gate ALLOW.',
  };
}

module.exports = {
  MODEL_PRICING,
  DEFAULT_VOICE_AGENT_TEMPLATE,
  BILLING_ESCALATION_MARKERS,
  calculateConversationCosts,
  compareModels,
  simulateConversationTest,
  evaluateThumbgatePreAction,
  promoteConfig,
  hasBillingEscalation,
};
