#!/usr/bin/env node
'use strict';

/**
 * Mixture-of-experts health from live LiteLLM traffic (software MoE).
 *
 * Closes the gap between route design and production: a route that is DEAD
 * in the 7-day traffic window must not win high-risk selection.
 *
 *   node tools/moe-expert-health.js --json
 *   node tools/moe-expert-health.js --gate   # exit 1 if any high-volume dead expert
 */

const os = require('os');
const { runReport } = require('./route-quality-report');

// Map traffic `model` strings → economic-router route ids (best effort).
const MODEL_TO_ROUTE = {
  'glm-5.2': 'glm52_reasoning',
  'glm-coding': 'glm52_reasoning',
  'z-ai/glm-5.2': 'glm52_reasoning',
  'zai-org/GLM-5.2': 'glm52_reasoning',
  'qwen2.5:3b-64k': 'local_fast',
  'qwen2.5:3b': 'local_fast',
  'qwen2.5:3b-hermes-64k': 'local_fast',
  'kimi-for-coding': 'kimi_coding_live',
  'kimi-coding': 'kimi_coding_live',
  'kimi-k2.7-code': 'kimi_coding_live',
  'nvidia/nemotron-3-ultra-550b-a55b:free': 'nemotron3_ultra_escalation',
  'grok-4.5': 'grok45_verifier_candidate',
};

const HIGH_VOLUME = 20; // requests in window before a dead expert is P0

function memoryPressure(options = {}) {
  const free = Number(options.freemem ?? os.freemem());
  const total = Number(options.totalmem ?? os.totalmem());
  if (!total || !Number.isFinite(free)) return { pressure: false, freeRatio: null };
  const freeRatio = free / total;
  return {
    pressure: freeRatio < 0.12,
    freeRatio: Number(freeRatio.toFixed(4)),
    freeBytes: free,
    totalBytes: total,
  };
}

function loadExpertHealth(options = {}) {
  const report = runReport({
    logPath: options.logPath,
    windowDays: options.windowDays === undefined ? 7 : options.windowDays,
  });
  const mem = memoryPressure(options);
  if (!report.ok) {
    return {
      ok: false,
      error: report.error,
      memory: mem,
      deadModels: [],
      deadRouteIds: [],
      healthyModels: [],
      byModel: {},
      byRouteId: {},
    };
  }

  const byModel = {};
  const byRouteId = {};
  const deadModels = [];
  const healthyModels = [];

  for (const r of report.routes || []) {
    const answerRate = r.answerRatePct == null ? null : r.answerRatePct / 100;
    const emptyRate = r.emptyRatePct == null ? null : r.emptyRatePct / 100;
    const dead =
      Boolean(r.deadRoute) ||
      (r.requests >= HIGH_VOLUME && answerRate !== null && answerRate < 0.1) ||
      (r.requests >= HIGH_VOLUME && emptyRate !== null && emptyRate > 0.9);

    const entry = {
      model: r.model,
      routeId: MODEL_TO_ROUTE[r.model] || null,
      requests: r.requests,
      answerRatePct: r.answerRatePct,
      emptyRatePct: r.emptyRatePct,
      deadRoute: Boolean(r.deadRoute),
      dead,
      toolCompliancePct: r.toolCompliancePct,
    };
    byModel[r.model] = entry;
    if (entry.routeId) {
      // Prefer the highest-volume observation for a route id
      const prev = byRouteId[entry.routeId];
      if (!prev || prev.requests < entry.requests) byRouteId[entry.routeId] = entry;
    }
    if (dead) deadModels.push(r.model);
    else if (r.requests >= 5 && answerRate !== null && answerRate >= 0.9) healthyModels.push(r.model);
  }

  const deadRouteIds = [...new Set(deadModels.map((m) => MODEL_TO_ROUTE[m]).filter(Boolean))];
  const highVolumeDead = (report.routes || []).filter(
    (r) => byModel[r.model]?.dead && r.requests >= HIGH_VOLUME,
  );

  return {
    ok: true,
    logPath: report.logPath,
    windowDays: report.windowDays,
    memory: mem,
    deadModels,
    deadRouteIds,
    healthyModels,
    highVolumeDead: highVolumeDead.map((r) => ({
      model: r.model,
      requests: r.requests,
      answerRatePct: r.answerRatePct,
      emptyRatePct: r.emptyRatePct,
    })),
    byModel,
    byRouteId,
    thresholds: { highVolume: HIGH_VOLUME },
  };
}

/** Observed stats shape for computeAdjustedRouteScore. */
function observedForRoute(health, routeId, model) {
  const entry = (health.byRouteId && health.byRouteId[routeId]) || (health.byModel && health.byModel[model]);
  if (!entry || !entry.requests) return null;
  const answerRate = entry.answerRatePct == null ? 0 : entry.answerRatePct / 100;
  return {
    calls: entry.requests,
    successCount: Math.round(answerRate * entry.requests),
    totalCostUsd: 0,
    avgLatencyMs: 0,
    dead: entry.dead,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const health = loadExpertHealth({});
  if (argv.includes('--json')) {
    console.log(JSON.stringify(health, null, 2));
  } else {
    if (!health.ok) {
      console.error(`moe-expert-health: ${health.error}`);
      process.exit(2);
    }
    console.log(`MoE expert health (window ${health.windowDays}d)`);
    console.log(
      `  memory pressure=${health.memory.pressure} freeRatio=${health.memory.freeRatio}`,
    );
    console.log(`  dead models: ${health.deadModels.join(', ') || '(none)'}`);
    console.log(`  healthy models: ${health.healthyModels.join(', ') || '(none)'}`);
    for (const d of health.highVolumeDead || []) {
      console.log(
        `  P0 DEAD volume=${d.requests} model=${d.model} answer%=${d.answerRatePct} empty%=${d.emptyRatePct}`,
      );
    }
  }
  if (argv.includes('--gate')) {
    process.exit(health.ok && (health.highVolumeDead || []).length === 0 ? 0 : 1);
  }
  process.exit(health.ok ? 0 : 2);
}

module.exports = {
  MODEL_TO_ROUTE,
  HIGH_VOLUME,
  loadExpertHealth,
  memoryPressure,
  observedForRoute,
};
