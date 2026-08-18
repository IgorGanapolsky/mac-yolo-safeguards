import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(import.meta.dirname, "..");
const selector = fs.readFileSync(path.join(root, "app/HostingSelector.tsx"), "utf8");
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");

test("thumbgate.app Hosting picker uses Vellum layout + honest product copy", () => {
  assert.match(selector, /Choose where you want your assistant to live/);
  assert.match(selector, /Need help deciding\?/);
  assert.match(selector, /ThumbGate Cloud/);
  assert.match(selector, /Always on, 24\/7, even when your computer is off/);
  assert.match(selector, /Runs directly on your machine/);
  assert.match(selector, /Your data never leaves your computer/);
  assert.match(selector, /Continue/);
  assert.doesNotMatch(selector, /Vellum Cloud/);
  assert.doesNotMatch(selector, /Mac-pair|phone leash|RUN ON/);
  assert.doesNotMatch(selector, /Autonomous PR governance/);
});

test("Cloud continue is the $10 hosted path; Local is not a second SKU", () => {
  assert.match(selector, /data-funnel-event="cloud_continuity_click"/);
  assert.match(selector, /href="#pricing"/);
  assert.match(selector, /not the \$10 hosted offer/);
  assert.match(page, /<HostingSelector/);
  assert.match(page, /The \$10 offer is hosted Hermes on a fenced VPS/);
});
