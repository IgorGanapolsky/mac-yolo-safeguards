'use strict';

/**
 * glm53-yolo-hook.js — wrappers call this before a paid GLM completion.
 * Coding Plan ($0) is always allowed. Metered / OpenRouter is $10/mo fail-closed.
 */

const budget = require('../zai-api-budget-guard');
const { ROUTES, classifyRoute } = require('../zai-glm53-fleet');

function shouldPreferCodingPlan(task = '') {
  return /\bglm\b|z\.?ai|coding plan|glm-5\.3|glm-coding/i.test(String(task));
}

function wrapPayload(payload = {}, task = '') {
  const route = classifyRoute(task);
  const next = budget.rewriteThinking({
    ...payload,
    model: payload.model || route.primary.model,
    reasoning_effort: payload.reasoning_effort || route.effort,
  });
  return { payload: next, route: route.primary, effort: route.effort, gate: route.gate };
}

function gateMetered(estimatedCostUsd, route) {
  return budget.checkGate(estimatedCostUsd, route || ROUTES.openrouter);
}

module.exports = {
  shouldPreferCodingPlan,
  wrapPayload,
  gateMetered,
  skillHint: 'Use GLM-5.3 via the Coding Plan (bin/zai-glm53). Metered API is $10/mo fail-closed.',
};
