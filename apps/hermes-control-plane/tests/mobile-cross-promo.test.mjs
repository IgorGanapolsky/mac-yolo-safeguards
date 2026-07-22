import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const funnelSignals = await readFile(new URL("../app/FunnelSignals.tsx", import.meta.url), "utf8");
const analyticsRoute = await readFile(new URL("../app/api/analytics/event/route.ts", import.meta.url), "utf8");

test("public landing links only to live Hermes Mobile store listings", () => {
  assert.match(funnelSignals, /apps\.apple\.com\/us\/app\/hermes-ai-agent-leash\/id6786778037/);
  assert.match(funnelSignals, /play\.google\.com\/store\/apps\/details\?id=com\.iganapolsky\.hermesmobile\.paid/);
  assert.doesNotMatch(funnelSignals, /thumbgate\.ai/);
});

test("store-link clicks are accepted by the bounded analytics allowlist", () => {
  for (const event of ["mobile_app_ios_click", "mobile_app_android_click"]) {
    assert.match(funnelSignals, new RegExp(`data-funnel-event=\\"${event}\\"`));
    assert.match(analyticsRoute, new RegExp(`\\"${event}\\"`));
  }
});
