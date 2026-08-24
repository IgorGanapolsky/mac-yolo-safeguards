import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_BOT_ROSTER,
  extractBotMention,
  getAllBots,
  getBotById,
} from "../lib/bot-mode.ts";

test("CANONICAL_BOT_ROSTER provides full 5-bot roster with specialized roles", () => {
  const bots = getAllBots();
  assert.equal(bots.length, 5);
  const ids = bots.map((b) => b.id);
  assert.ok(ids.includes("chief"));
  assert.ok(ids.includes("ralph"));
  assert.ok(ids.includes("ship"));
  assert.ok(ids.includes("qa"));
  assert.ok(ids.includes("raven"));
});

test("extractBotMention extracts @mention and cleans prompt correctly", () => {
  const res1 = extractBotMention("@ralph run the revenue loop now");
  assert.ok(res1.targetBot);
  assert.equal(res1.targetBot.id, "ralph");
  assert.equal(res1.cleanedPrompt, "run the revenue loop now");

  const res2 = extractBotMention("@QA verify all ground-truth receipts");
  assert.ok(res2.targetBot);
  assert.equal(res2.targetBot.id, "qa");
  assert.equal(res2.cleanedPrompt, "verify all ground-truth receipts");

  const res3 = extractBotMention("Build the new dashboard UI");
  assert.equal(res3.targetBot, null);
  assert.equal(res3.cleanedPrompt, "Build the new dashboard UI");
});

test("getBotById falls back safely to chief for unknown bot ids", () => {
  const chief = getBotById("chief");
  assert.equal(chief.id, "chief");

  const unknown = getBotById("nonexistent-bot");
  assert.equal(unknown.id, "chief");
});
