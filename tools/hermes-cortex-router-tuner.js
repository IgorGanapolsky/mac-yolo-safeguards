#!/usr/bin/env node
'use strict';

/**
 * hermes-cortex-router-tuner.js — Snowflake ML feedback loop for the economic router
 *
 * Implements the Cortex ML high-ROI improvement: learn from observed traffic to tune
 * model reliability, latency, and cost recommendations.
 *
 * Like Snowflake CORTEX ML.FORECAST + AI_CLASSIFY, this tool:
 * - Reads HERMES.TRAFFIC (traffic.jsonl aggregated across fleet)
 * - Computes observed reliability, latency, failure categories
 * - Produces tuned ROUTES (like Snowflake's model registry update)
 * - Emits a DGM-style adoption gate: only promote if observed evidence beats baseline
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ROUTES } = require('./hermes-economic-router');

function tuneFromTraffic(traffic, opts = {}) {
  const modelStats = {};
  for (const r of traffic) {
    const model = String(r.model || 'unknown').toLowerCase();
    if (!modelStats[model]) modelStats[model] = { total: 0, success: 0, latencySum: 0, latencyCount: 0, tokens: 0, failures: 0, quotaFailures: 0, truncated: 0 };
    const s = modelStats[model];
    s.total += 1;
    if (r.status === 'success') s.success += 1; else s.failures += 1;
    s.tokens += Number(r.total_tokens || 0);
    if (r.latency_ms) { s.latencySum += r.latency_ms; s.latencyCount += 1; }
    // classify
    try {
      const { aiClassifyFailure } = require('./hermes-cortex-fleet');
      const cls = aiClassifyFailure(r);
      if (cls.category === 'quota_exhausted') s.quotaFailures += 1;
      if (cls.category === 'truncated_empty') s.truncated += 1;
    } catch {}
  }

  const tuned = ROUTES.map(route => {
    const modelKey = String(route.model || '').toLowerCase();
    // match observed stats by fuzzy model name
    const observed = Object.entries(modelStats).find(([k]) => k.includes(modelKey) || modelKey.includes(k) || k === modelKey);
    if (!observed) return { ...route, observed: null, tuned_reliability: route.reliability, tuning: 'no_observed_data' };
    const [obsModel, stats] = observed;
    const observedReliability = stats.total ? stats.success / stats.total : route.reliability;
    const observedLatency = stats.latencyCount ? Math.round(stats.latencySum / stats.latencyCount) : route.latencyMs;
    // DGM adoption gate: only tune if we have >= 5 samples
    const hasEnough = stats.total >= (opts.minSamples || 5);
    const tunedReliability = hasEnough ? 0.7 * route.reliability + 0.3 * observedReliability : route.reliability;
    const quotaRisk = stats.quotaFailures > 0 ? `quota failures ${stats.quotaFailures}/${stats.total}` : 'no quota failures';
    return {
      id: route.id,
      model: route.model,
      provider: route.provider,
      baseline_reliability: route.reliability,
      observed_model_match: obsModel,
      observed: {
        total: stats.total,
        reliability: +observedReliability.toFixed(3),
        avg_latency_ms: observedLatency,
        tokens: stats.tokens,
        failure_rate: +(stats.failures / stats.total).toFixed(3),
        quotaFailures: stats.quotaFailures,
        truncated: stats.truncated,
      },
      tuned_reliability: +tunedReliability.toFixed(3),
      tuning: hasEnough ? 'tuned_from_observed' : 'insufficient_samples',
      risk_signal: quotaRisk,
      recommendation: observedReliability < 0.5 ? `demote ${route.id}: observed reliability ${observedReliability.toFixed(2)} < 0.5` :
                      observedReliability > route.reliability + 0.15 ? `consider promoting ${route.id}: observed ${observedReliability.toFixed(2)} > baseline ${route.reliability}` :
                      `keep ${route.id}: observed ${observedReliability.toFixed(2)} ~ baseline ${route.reliability}`,
    };
  });

  const anomalies = [];
  for (const [model, stats] of Object.entries(modelStats)) {
    if (stats.quotaFailures >= 3) anomalies.push({ model, type: 'quota_exhaustion', count: stats.quotaFailures, severity: 'critical' });
    if (stats.truncated >= 3) anomalies.push({ model, type: 'truncated_spike', count: stats.truncated, severity: 'high' });
    if (stats.total >= 10 && stats.failures / stats.total > 0.6) anomalies.push({ model, type: 'high_failure_rate', rate: +(stats.failures / stats.total).toFixed(2), severity: 'high' });
  }

  return {
    schema: 'cortex-router-tuner/v1',
    generatedAt: new Date().toISOString(),
    total_observed_requests: traffic.length,
    models_observed: Object.keys(modelStats).length,
    tuned,
    anomalies,
    snowflake_sql_preview: `SELECT * FROM HERMES.MODEL_RELIABILITY WHERE reliability < 0.7 ORDER BY failure_rate DESC;`,
    cortex_fn: 'ML model registry + AI_CLASSIFY feedback loop',
  };
}

function loadTraffic() {
  try {
    const { aggregateFleetTraffic } = require('./hermes-cortex-fleet');
    return aggregateFleetTraffic();
  } catch {
    return [];
  }
}

function main() {
  const traffic = loadTraffic();
  const report = tuneFromTraffic(traffic);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

module.exports = { tuneFromTraffic, loadTraffic };

if (require.main === module) {
  main();
}
