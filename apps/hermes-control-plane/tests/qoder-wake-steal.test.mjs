import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../app/how-it-works/page.tsx", import.meta.url), "utf8");
const faq = readFileSync(new URL("../app/landing-content.ts", import.meta.url), "utf8");
const publicCopy = `${page}\n${detail}\n${faq}`;

test("steals QoderWake always-on employee, not local desktop or phone control", () => {
  assert.match(publicCopy, /Always awake\. Always working/);
  assert.match(publicCopy, /Do I install a desktop app\?/);
  assert.match(publicCopy, /Local desktop employees die when the laptop sleeps/);
  // "Start on VPS" is honest hosted copy (rendered-html.test.mjs). Ban the old
  // machine picker and Qoder desktop/phone-control surfaces, not the verb.
  assert.doesNotMatch(publicCopy, /QoderWork|no uploads needed|Mobile control center|Which machine\?|Cloud vs Local|RUN ON picker/i);
});
