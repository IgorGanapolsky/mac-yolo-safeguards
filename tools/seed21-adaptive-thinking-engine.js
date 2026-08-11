#!/usr/bin/env node
'use strict';

/**
 * ByteDance Seed 2.1 Adaptive Thinking & Harness Engine
 * (Based on ByteDance Seed 2.1 / Volcengine Ark Architecture)
 * Dynamically balances token thinking budget (fast 0-token vs deep thinking)
 * based on task complexity, context length, and harness safety requirements.
 */

const fs = require('fs');
const path = require('path');

class Seed21AdaptiveThinkingEngine {
  constructor(options = {}) {
    this.maxThinkingBudget = options.maxThinkingBudget || 8192; // 8k tokens max for deep reasoning
    this.minThinkingBudget = options.minThinkingBudget || 0;    // 0 tokens for simple tasks
  }

  /**
   * Classify task complexity and calculate optimal thinking budget
   */
  allocateThinkingBudget(taskPayload = {}) {
    const rawPrompt = String(taskPayload.prompt || '');
    const isMultiFile = Boolean(taskPayload.isMultiFile || rawPrompt.includes('multi-file') || rawPrompt.length > 500);
    const requiresArchitecture = Boolean(taskPayload.requiresArchitecture || /architect|design|refactor|harness/i.test(rawPrompt));

    let allocatedBudget = 0;
    let thinkingMode = 'no_thinking';

    if (requiresArchitecture) {
      allocatedBudget = this.maxThinkingBudget;
      thinkingMode = 'deep_reasoning';
    } else if (isMultiFile) {
      allocatedBudget = 2048;
      thinkingMode = 'adaptive_thinking';
    } else {
      allocatedBudget = this.minThinkingBudget;
      thinkingMode = 'fast_path';
    }

    return {
      taskName: taskPayload.taskName || 'unnamed-task',
      thinkingMode,
      allocatedBudgetTokens: allocatedBudget,
      tokenEfficiencyGainPct: allocatedBudget === 0 ? 100 : Number(((1 - allocatedBudget / 8192) * 100).toFixed(1)),
      seedModelParity: 'Seed2.1-MoE-118B-A8B',
    };
  }

  /**
   * Generate ByteDance Volcengine Ark API invocation payload
   */
  buildArkPayload(prompt, options = {}) {
    const allocation = this.allocateThinkingBudget({ prompt, ...options });
    return {
      model: 'seed-2.1-pro',
      messages: [{ role: 'user', content: prompt }],
      thinking_config: {
        thinking_budget: allocation.allocatedBudgetTokens,
        mode: allocation.thinkingMode,
      },
      temperature: allocation.allocatedBudgetTokens > 0 ? 0.2 : 0.0,
      stream: true,
    };
  }
}

if (require.main === module) {
  const engine = new Seed21AdaptiveThinkingEngine();
  const result = engine.allocateThinkingBudget({
    prompt: 'Refactor multi-agent harness architecture with Seed 2.1 adaptive thinking',
  });
  console.log('=== ByteDance Seed 2.1 Adaptive Thinking Allocation ===');
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  Seed21AdaptiveThinkingEngine,
};
