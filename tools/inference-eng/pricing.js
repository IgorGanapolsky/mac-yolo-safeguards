'use strict';

/**
 * USD per 1M tokens — approximate operator table for cost modeling.
 * Flat-rate subscription models score as 0 marginal (quota-limited, not $0).
 * Update when provider cards change; never invent free as unlimited.
 */

const PRICING = Object.freeze({
  // SuperGrok / grok.com OAuth — subscription plan; marginal 0 for fleet accounting
  'grok-4.5': { inputPerM: 0, outputPerM: 0, tier: 'subscription', note: 'SuperGrok plan' },
  // z.ai Coding Plan
  'glm-coding': { inputPerM: 0, outputPerM: 0, tier: 'subscription', note: 'z.ai coding plan' },
  'glm-5.2': { inputPerM: 0, outputPerM: 0, tier: 'subscription', note: 'z.ai / gateway alias' },
  // Kimi membership
  'kimi-code': { inputPerM: 0, outputPerM: 0, tier: 'subscription' },
  'kimi-for-coding': { inputPerM: 0, outputPerM: 0, tier: 'subscription' },
  'kimi-code-fast': { inputPerM: 0, outputPerM: 0, tier: 'subscription' },
  'kimi-code-k3': { inputPerM: 0, outputPerM: 0, tier: 'subscription' },
  // Free / open
  'deepseek-v4-flash': { inputPerM: 0, outputPerM: 0, tier: 'free_or_promotional' },
  'deepseek-v4-flash-free': { inputPerM: 0, outputPerM: 0, tier: 'free' },
  'hermes-local': { inputPerM: 0, outputPerM: 0, tier: 'local' },
  // hermes-local-fast removed 2026-08-05 (LiteLLM dual-alias hang); cost as hermes-local if seen in logs
  'hermes-coder': { inputPerM: 0, outputPerM: 0, tier: 'local' },
  'qwen3:8b-64k': { inputPerM: 0, outputPerM: 0, tier: 'local' },
  // Metered references (OpenRouter-style) when those paths are used
  'z-ai/glm-5.2': { inputPerM: 0.5, outputPerM: 1.5, tier: 'metered' },
  'openai/deepseek-v4-flash-free': { inputPerM: 0, outputPerM: 0, tier: 'free' },
});

/**
 * @param {string} model
 * @param {number} promptTokens
 * @param {number} completionTokens
 * @returns {{ usd: number, tier: string, known: boolean }}
 */
function estimateCostUsd(model, promptTokens = 0, completionTokens = 0) {
  const id = String(model || '').trim();
  const row = PRICING[id];
  if (!row) {
    // Unknown metered fallback: conservative mid-tier estimate
    const usd = ((Number(promptTokens) || 0) * 1 + (Number(completionTokens) || 0) * 3) / 1e6;
    return { usd, tier: 'unknown', known: false };
  }
  const usd =
    ((Number(promptTokens) || 0) * row.inputPerM + (Number(completionTokens) || 0) * row.outputPerM) /
    1e6;
  return { usd, tier: row.tier, known: true };
}

module.exports = { PRICING, estimateCostUsd };
