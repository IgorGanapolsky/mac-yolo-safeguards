import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("steals QoderWake always-on employee, not local desktop or phone control", () => {
  assert.match(page, /Always awake\. Always working/);
  assert.match(page, /Do I install a desktop app\?/);
  assert.match(page, /Local desktop employees die when the laptop sleeps/);
  // "Start on VPS" is honest hosted copy (rendered-html.test.mjs). Ban the old
  // machine picker and Qoder desktop/phone-control surfaces, not the verb.
  assert.doesNotMatch(page, /QoderWork|no uploads needed|Mobile control center|Which machine\?|Cloud vs Local|RUN ON picker/i);
});
