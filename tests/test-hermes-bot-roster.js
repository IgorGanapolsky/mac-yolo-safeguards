import test from "node:test";
import assert from "node:assert/strict";
import { BOT_ROSTER, resolveBotDispatch, saveBotModeState } from "../tools/hermes-bot-roster.js";

test("BOT_ROSTER defines canonical Nous Hermes bots", () => {
  assert.ok(BOT_ROSTER.chief);
  assert.ok(BOT_ROSTER.ralph);
  assert.ok(BOT_ROSTER.ship);
  assert.ok(BOT_ROSTER.qa);
  assert.ok(BOT_ROSTER.raven);
});

test("resolveBotDispatch parses mentions and defaults to Chief", () => {
  const d1 = resolveBotDispatch("@ship run green CI gate");
  assert.equal(d1.isMention, true);
  assert.equal(d1.bot.id, "ship");
  assert.equal(d1.cleanedPrompt, "run green CI gate");

  const d2 = resolveBotDispatch("Just do normal task");
  assert.equal(d2.isMention, false);
  assert.equal(d2.bot.id, "chief");
});

test("saveBotModeState safely persists canonical bot state", () => {
  const res = saveBotModeState("chief", { activeThreadId: "thread-123", status: "idle" });
  assert.ok(res);
  assert.equal(res.botId, "chief");
  assert.equal(res.activeThreadId, "thread-123");
});
