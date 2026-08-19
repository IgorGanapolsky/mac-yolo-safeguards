import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const apphost = readFileSync(new URL("../lib/hosted-apphost.ts", import.meta.url), "utf8");
const llms = readFileSync(new URL("../app/llms.txt/route.ts", import.meta.url), "utf8");

const ADVERTISE_CAPTURE_RE =
  /lets ChatGPT learn from everything you do on your computer|(?<!do not )(?<!not )(?<!never )learn from everything you do on your computer|records? your (clicks|keystrokes)|enable Computer History|searchable timeline of your (Mac )?activity/i;

function advertisesCapture(text) {
  if (/do not learn from everything you do on your computer/i.test(text)) {
    return /lets ChatGPT learn from everything you do on your computer|records? your (clicks|keystrokes)|enable Computer History|searchable timeline of your (Mac )?activity/i.test(text);
  }
  return ADVERTISE_CAPTURE_RE.test(text);
}

test("landing does not advertise Computer History or keystroke capture", () => {
  assert.match(page, /not ChatGPT Computer History/i);
  assert.match(page, /not Windows Recall/i);
  assert.match(page, /not a Mac keylogger/i);
  assert.match(page, /does not grab the cursor/i);
  assert.match(page, /Does hosted Hermes record Computer History or capture keystrokes\?/);
  assert.match(page, /Private\/incognito analogue/);
  assert.equal(advertisesCapture(page), false);
  assert.doesNotMatch(page, /we (record|capture|log) (your )?(clicks|keystrokes)/i);
});

test("dashboard does not advertise Computer History or keystroke capture", () => {
  assert.match(dashboard, /HOSTED_NOT_COMPUTER_HISTORY/);
  assert.match(dashboard, /hosted-not-computer-history/);
  assert.match(dashboard, /not ChatGPT Computer History/i);
  assert.match(dashboard, /not Windows Recall/i);
  assert.match(dashboard, /not a Mac keylogger/i);
  assert.match(dashboard, /does not grab the cursor/i);
  assert.match(dashboard, /cannot read secrets/);
  assert.match(dashboard, /Slack or DMs/);
  assert.equal(advertisesCapture(dashboard), false);
  assert.equal(advertisesCapture(apphost), false);
  assert.match(apphost, /HOSTED_NOT_COMPUTER_HISTORY/);
  assert.match(apphost, /not ChatGPT Computer History/i);
});

test("llms.txt and landing FAQ deny Computer History", () => {
  assert.match(llms, /not ChatGPT Computer History/i);
  assert.match(llms, /not Windows Recall/i);
  assert.match(llms, /does not grab the cursor/i);
  assert.equal(advertisesCapture(llms), false);
});
