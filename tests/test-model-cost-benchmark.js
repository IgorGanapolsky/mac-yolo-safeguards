"use strict";
const assert = require("assert");
const b = require("../tools/model-cost-benchmark.js");

// --- PDF source-of-truth (steal fidelity) ---
// "Median cost per agent session" table (OpenRouter, 30d to 2026-08-09).
assert.strictEqual(b.MODEL_COST_PER_AGENT_SESSION["google/gemini-3.7-flash"], 0.10);
assert.strictEqual(b.MODEL_COST_PER_AGENT_SESSION["deepseek-v4-flash"], 0.04);
assert.strictEqual(b.MODEL_COST_PER_AGENT_SESSION["glm-5.2"], 0.23);
assert.strictEqual(b.MODEL_COST_PER_AGENT_SESSION["gpt-5.6-terra"], 0.37);
assert.strictEqual(b.MODEL_COST_PER_AGENT_SESSION["google/gemini-3.6-flash"], 0.40);
assert.strictEqual(b.MODEL_COST_PER_AGENT_SESSION["muse-spark-1.2"], 0.50);
assert.strictEqual(b.MODEL_COST_PER_AGENT_SESSION["claude-sonnet-5"], 0.70);
assert.strictEqual(Object.keys(b.MODEL_COST_PER_AGENT_SESSION).length, 7);

// Gemini 3.7 Flash 50%-off intro pricing (Launch email: $0.75->$0.375, $3.75->$1.875).
const g = b.MODEL_PRICING_PER_M_TOKEN["google/gemini-3.7-flash"];
assert.strictEqual(g.inputUsdPerM, 0.375);
assert.strictEqual(g.outputUsdPerM, 1.875);
assert.strictEqual(g.cachedUsdPerM, 0.0375);
assert.strictEqual(g.promoDiscount, 0.5);
assert.strictEqual(b.PROMO_END_AT, "2026-08-27T23:59:59Z");
assert.deepStrictEqual(b.PROMO_MODEL_IDS, ["google/gemini-3.7-flash"]);

// --- ranking (cheapest first = closest-first "best fit" for a cheap turn) ---
const ranked = b.rankByCostPerSession();
assert.strictEqual(ranked.length, 7);
assert.strictEqual(ranked[0].model, "deepseek-v4-flash");
assert.strictEqual(ranked[0].costPerSessionUsd, 0.04);
assert.strictEqual(ranked[ranked.length - 1].model, "claude-sonnet-5");
assert.strictEqual(ranked[ranked.length - 1].costPerSessionUsd, 0.70);
assert.strictEqual(
  ranked.find((r) => r.model === "google/gemini-3.7-flash").costPerSessionUsd,
  0.10,
);
// strictly ascending
assert.deepStrictEqual(ranked.map((r) => r.model), [
  "deepseek-v4-flash",
  "google/gemini-3.7-flash",
  "glm-5.2",
  "gpt-5.6-terra",
  "google/gemini-3.6-flash",
  "muse-spark-1.2",
  "claude-sonnet-5",
]);

// --- best value = cheapest session model ---
assert.deepStrictEqual(b.bestValueModel(), {
  model: "deepseek-v4-flash",
  costPerSessionUsd: 0.04,
});

// --- promoted launch model ---
const promoted = b.highlightedModel();
assert.strictEqual(promoted.model, "google/gemini-3.7-flash");
assert.strictEqual(promoted.costPerSessionUsd, 0.10);
assert.strictEqual(promoted.promoDiscount, 0.5);

// --- intro-pricing window: 50% off through Aug 27, full price Aug 28+ ---
assert.strictEqual(b.promoActive("google/gemini-3.7-flash", new Date("2026-08-21T12:00:00Z")), true);
assert.strictEqual(b.promoActive("google/gemini-3.7-flash", new Date("2026-08-27T23:59:58Z")), true);
assert.strictEqual(b.promoActive("google/gemini-3.7-flash", new Date("2026-08-28T00:00:00Z")), false);
assert.strictEqual(b.promoActive("claude-sonnet-5", new Date("2026-08-21T12:00:00Z")), false);

console.log("model-cost-benchmark: all assertions passed");
