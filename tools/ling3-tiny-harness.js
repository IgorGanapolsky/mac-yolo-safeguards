'use strict';

/**
 * Ling 3.0 Tiny Gateway Harness & Zero-Cost Route Adapter
 * (Vercel AI Gateway Ling 3.0 Tiny Free Trial Integration)
 */

function resolveLing3Route(promptText = '') {
  const isMicroTask = promptText.length < 200 && !promptText.toLowerCase().includes('refactor');
  
  return {
    recommendedModel: isMicroTask ? 'ling-3.0-tiny' : 'openrouter/auto',
    provider: 'vercel-ai-gateway',
    isFreeTier: true,
    estimatedLatencyMs: isMicroTask ? 45 : 120,
    zeroCostPolicyPass: true,
  };
}

class Ling3TinyHarness {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.VERCEL_AI_GATEWAY_KEY || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = options.baseUrl || 'https://ai-gateway.vercel.app/v1';
  }

  evaluateTask(prompt) {
    return resolveLing3Route(prompt);
  }
}

module.exports = {
  resolveLing3Route,
  Ling3TinyHarness,
};
