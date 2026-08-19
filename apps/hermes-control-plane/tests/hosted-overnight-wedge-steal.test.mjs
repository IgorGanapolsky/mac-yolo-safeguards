import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("landing steals isolated overnight VPS copy, not a clone", () => {
  assert.match(page, /Isolated fenced VPS\. Not your laptop/);
  assert.match(page, /Does not grab your mouse or cursor/);
  assert.match(page, /Keeps going overnight while the laptop sleeps/);
  assert.match(page, /hours, not a chat box/);
  assert.match(page, /Asks you only when money, customer, or production is at risk/);
  assert.match(page, /Chat answers; the hosted run does the work/);
  assert.match(page, /Hosted runs persist/);
  assert.match(page, /Overnight coding on a fenced VPS at a flat \$10/);
  assert.doesNotMatch(page, /\$200/);
  assert.doesNotMatch(page, /20-model swarm|20-model supervisor/i);
  assert.doesNotMatch(page, /connector marketplace/i);
  assert.doesNotMatch(page, /AI workforce/i);
  assert.doesNotMatch(page, /Slack as the control/i);
  assert.doesNotMatch(page, /OpenClaw|Eigent|E2B|trycua|\bCua\b|Agent S|Firecracker|\bSPACE\b|Perplexity/i);
  assert.doesNotMatch(page, /months-long digital worker/i);
  assert.doesNotMatch(page, /Machine found|lid-close|RUN ON picker/i);
});
