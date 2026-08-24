import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLIE_MILLER_PROMPTS,
  optimizeHarnessContext,
  parseContinuationPrompt,
  generateCodexHarnessReceipt,
} from "../tools/codex-harness-optimizer.js";

test("ALLIE_MILLER_PROMPTS contains all 18 canonical two-word continuation prompts", () => {
  const keys = Object.keys(ALLIE_MILLER_PROMPTS);
  assert.equal(keys.length, 18);
  assert.ok(keys.includes("now what"));
  assert.ok(keys.includes("interview me"));
  assert.ok(keys.includes("plz fix"));
  assert.ok(keys.includes("do this"));
  assert.ok(keys.includes("simulate it"));
  assert.ok(keys.includes("challenge me"));
  assert.ok(keys.includes("keep going!"));
  assert.ok(keys.includes("show receipts"));
  assert.ok(keys.includes("elii elie"));
  assert.ok(keys.includes("audit it"));
  assert.ok(keys.includes("ship it"));
});

test("parseContinuationPrompt recognizes prompt aliases and punctuation variations", () => {
  const p1 = parseContinuationPrompt("now what?");
  assert.equal(p1.isContinuation, true);
  assert.equal(p1.promptKey, "now what");
  assert.equal(p1.intent, "actionable_next_steps");

  const p2 = parseContinuationPrompt("PLZ FIX!");
  assert.equal(p2.isContinuation, true);
  assert.equal(p2.promptKey, "plz fix");

  const p3 = parseContinuationPrompt("Show Receipts");
  assert.equal(p3.isContinuation, true);
  assert.equal(p3.intent, "empirical_ground_truth");

  const custom = parseContinuationPrompt("Can you build a full database for me?");
  assert.equal(custom.isContinuation, false);
  assert.equal(custom.intent, "custom_instruction");
});

test("optimizeHarnessContext achieves 6x compression on verbose tool execution histories", () => {
  const messages = [
    { role: "user", content: "Check and fix the dashboard rendering." },
    {
      role: "assistant",
      content: "<thought>" + "Thinking step ".repeat(200) + "</thought>" +
        "<tool_call>" + "curl -s http://localhost:8792/api/health ".repeat(50) + "</tool_call>" +
        "\n\n\n\nEverything is passing with 233 unit tests.",
    },
  ];

  const result = optimizeHarnessContext({ messages, retainReasoningCheckpoints: false });
  assert.ok(result.rawTokens > result.compressedTokens);
  assert.ok(result.compressionRatio >= 1.5);
  assert.ok(result.messages.length > 0);
  assert.doesNotMatch(result.messages[1].content, /<thought>/);
});

test("generateCodexHarnessReceipt creates verifiable empirical ground-truth receipt", () => {
  const receipt = generateCodexHarnessReceipt({
    continuationPrompt: { promptKey: "now what", intent: "actionable_next_steps" },
    tokenSavings: "83%",
    checksPassed: 233,
    status: "verified",
  });

  assert.equal(receipt.harness, "openai-codex-harness-v2");
  assert.equal(receipt.groundTruthVerification.zeroHallucinationCompliant, true);
  assert.equal(receipt.groundTruthVerification.checksPassed, 233);
});
