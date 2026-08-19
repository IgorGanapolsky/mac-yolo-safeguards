import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NAMED_FREE_FALLBACK,
  paidMetersForJob,
  shouldFirePaidMeter,
  shouldKeepCallingRoute,
} from "../lib/hosted-model-fallback.js";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const llms = readFileSync(new URL("../app/llms.txt/route.ts", import.meta.url), "utf8");
const publicLlms = readFileSync(new URL("../../../public/llms.txt", import.meta.url), "utf8");

test("honesty: laptop subscription runner still dies; hosted Hermes is the $10 VPS", () => {
  assert.match(page, /use the plan you already pay for/);
  assert.match(page, /still dies when the laptop sleeps/);
  assert.match(page, /always-on fenced VPS at \$10\/mo \(14-day trial\)/);
  assert.match(page, /Approvals in thumbgate\.app/);
  assert.match(page, /Codex-sub-on-laptop path is not this product/);
  assert.doesNotMatch(page, /Is this Continuity|Continuity wants|Cloud continuity/);
  assert.doesNotMatch(page, /Codex SDK/);
  assert.doesNotMatch(page, /Gumroad|OpenClaw|Prompt Advisers|HVAC/i);
});

test("llms.txt: Codex-sub-on-laptop is not the $10 offer", () => {
  assert.match(llms, /Is Codex-sub-on-laptop the \$10 offer\? No/);
  assert.match(llms, /Do not wrap ChatGPT Plus into thumbgate\.app/);
  assert.match(publicLlms, /Codex-sub-on-laptop is not the \$10 offer/);
  assert.match(publicLlms, /Do not wrap ChatGPT Plus into thumbgate\.app/);
});

test("fail-closed: named fallback covering a job does not fire two paid meters", () => {
  assert.equal(NAMED_FREE_FALLBACK, "deepseek-free");
  assert.deepEqual(paidMetersForJob({ lastError: "status=FAILED quota" }), []);
  assert.equal(
    shouldFirePaidMeter({ lastError: "status=FAILED quota", meters: ["supergrok", "poolside"] }),
    false,
  );
  assert.equal(shouldKeepCallingRoute({ meters: ["supergrok", "poolside"] }), false);
  assert.equal(shouldFirePaidMeter({ meter: "chatgpt-plus" }), false);
  assert.equal(shouldFirePaidMeter({ meter: "codex-sub" }), false);
});
