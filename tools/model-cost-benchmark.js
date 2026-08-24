/**
 * Hermes-yolo model cost benchmark — steals OpenRouter's "Ori Eval: find the
 * best model for what you're building" methodology (run YOUR agent on YOUR
 * prompts, grade the answers) and the "Median cost per agent session" table,
 * seeded with Gemini 3.7 Flash's 50%-off-intro launch pricing.
 *
 * Data source: OpenRouter launch email "Gemini 3.7 Flash: now live, 50% off
 * intro pricing" (received 2026-08-21). Figures are the median USD cost of a
 * 10-to-49-turn agent session unless noted. Per-M-token prices for Gemini 3.7
 * Flash are the 50%-off intro rate (original Gemini 3.6 Flash rate halved);
 * Gemini 3.7 Flash's $0.10/session is estimated from 3.6 Flash sessions at the
 * promo rate.
 *
 * The hermes-economic-router (tools/hermes-economic-router.js) is the live
 * cost/latency/signal router and is intentionally NOT modified here; this module
 * is its pricing datafeed + the cheapest-effective-model decision that the
 * router should consult before routing a cheap agent turn.
 */
"use strict";

// Median USD cost of a 10-to-49 turn agent session (OpenRouter, 30d to 2026-08-09).
const MODEL_COST_PER_AGENT_SESSION = Object.freeze({
  "deepseek-v4-flash": 0.04,
  "google/gemini-3.7-flash": 0.10,
  "glm-5.2": 0.23,
  "gpt-5.6-terra": 0.37,
  "google/gemini-3.6-flash": 0.40,
  "muse-spark-1.2": 0.50,
  "claude-sonnet-5": 0.70,
});

// Per-M-token pricing. Only Gemini 3.7 Flash has full per-token data in the
// launch email; the figures below are the 50%-off intro rate.
const MODEL_PRICING_PER_M_TOKEN = Object.freeze({
  "google/gemini-3.7-flash": Object.freeze({
    inputUsdPerM: 0.375,
    outputUsdPerM: 1.875,
    cachedUsdPerM: 0.0375,
    promoDiscount: 0.5,
    promoEnd: "2026-08-27T23:59:59Z",
  }),
});

const PROMO_MODEL_IDS = Object.freeze(["google/gemini-3.7-flash"]);
// 50% off intro pricing runs through end of day Aug 27, 2026 (per launch email).
const PROMO_END_AT = "2026-08-27T23:59:59Z";

/** Ascending cost-per-session ranking (cheapest first) — Ori Eval "best fit". */
function rankByCostPerSession() {
  return Object.entries(MODEL_COST_PER_AGENT_SESSION)
    .map(([model, costPerSessionUsd]) => ({ model, costPerSessionUsd }))
    .sort((a, b) => a.costPerSessionUsd - b.costPerSessionUsd);
}

/** Cheapest model in the session benchmark (best raw value). */
function bestValueModel() {
  return rankByCostPerSession()[0];
}

/** Headline launch model promoted by the email (Gemini 3.7 Flash). */
function highlightedModel() {
  return {
    model: "google/gemini-3.7-flash",
    costPerSessionUsd: MODEL_COST_PER_AGENT_SESSION["google/gemini-3.7-flash"],
    promoDiscount: 0.5,
    promoEnd: PROMO_END_AT,
  };
}

/** True when the 50%-off intro rate is live for `modelId` at `now`. */
function promoActive(modelId, now = new Date()) {
  if (!PROMO_MODEL_IDS.includes(modelId)) return false;
  const t = now instanceof Date ? now : new Date(now);
  return t < new Date(PROMO_END_AT);
}

module.exports = {
  MODEL_COST_PER_AGENT_SESSION,
  MODEL_PRICING_PER_M_TOKEN,
  PROMO_MODEL_IDS,
  PROMO_END_AT,
  rankByCostPerSession,
  bestValueModel,
  highlightedModel,
  promoActive,
};

if (require.main === module) {
  // CLI: print the cost ranking — the "best model for what you're building"
  // view the economic router should consult before routing a cheap agent turn.
  const ranked = rankByCostPerSession();
  console.log("rank\tmodel" + " ".repeat(20) + "$ / agent session");
  ranked.forEach((r, i) => {
    console.log(`${i + 1}\t${r.model.padEnd(24)}$$${r.costPerSessionUsd.toFixed(2)}`);
  });
  const promoted = highlightedModel();
  console.log(
    `\npromoted: ${promoted.model} ($${promoted.costPerSessionUsd.toFixed(2)}/session, ` +
    `${promoted.promoDiscount * 100}% off intro through ${promoted.promoEnd})`,
  );
}
