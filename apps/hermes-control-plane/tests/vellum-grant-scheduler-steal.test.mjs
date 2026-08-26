import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GRANT_DURATIONS,
  GrantStore,
  TEN_MINUTE_GRANT_MS,
  evaluateGrant,
} from "../lib/grant-duration.ts";
import {
  VPS_UNFINISHED_CHECK_INTERVAL_MS,
  evaluateUnfinishedCheck,
} from "../lib/vps-unfinished-check.ts";

const NOW = 1_800_000_000_000;
const grantSrc = readFileSync(new URL("../lib/grant-duration.ts", import.meta.url), "utf8");
const schedSrc = readFileSync(new URL("../lib/vps-unfinished-check.ts", import.meta.url), "utf8");
const landing = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const faq = readFileSync(new URL("../app/landing-content.ts", import.meta.url), "utf8");
const publicCopy = `${landing}\n${faq}`;

test("steals Vellum once / 10m / always and keeps default deny", () => {
  assert.deepEqual([...GRANT_DURATIONS], ["once", "10m", "always"]);
  assert.equal(evaluateGrant(null, { toolName: "host_bash", now: NOW }).allowed, false);
  const store = new GrantStore();
  assert.equal(store.authorize("host_bash", NOW).allowed, false);
  assert.equal(store.decide({ toolName: "host_bash", action: "once", now: NOW }).allowed, true);
  assert.equal(store.authorize("host_bash", NOW + 1).allowed, false);
  assert.equal(store.decide({ toolName: "host_bash", action: "10m", now: NOW }).allowed, true);
  assert.equal(store.authorize("host_bash", NOW + TEN_MINUTE_GRANT_MS - 1).allowed, true);
  assert.equal(store.authorize("host_bash", NOW + TEN_MINUTE_GRANT_MS).allowed, false);
});

test("hourly unfinished ping is VPS-only and will not interrupt a live chat", () => {
  const item = { id: "w1", kind: "unfinished", dueAt: null, summary: "Open PR still needs review" };
  assert.equal(VPS_UNFINISHED_CHECK_INTERVAL_MS, 60 * 60 * 1000);
  assert.equal(
    evaluateUnfinishedCheck({
      runtime: "laptop",
      now: NOW,
      lastFiredAt: null,
      conversationActive: false,
      items: [item],
    }).reason,
    "not_vps",
  );
  assert.equal(
    evaluateUnfinishedCheck({
      runtime: "vps",
      now: NOW,
      lastFiredAt: null,
      conversationActive: true,
      items: [item],
    }).reason,
    "conversation_active",
  );
  assert.equal(
    evaluateUnfinishedCheck({
      runtime: "vps",
      now: NOW,
      lastFiredAt: null,
      conversationActive: false,
      items: [item],
    }).fire,
    true,
  );
});

test("does not steal Continuity, Cloud vs Local, or a phone leash", () => {
  const stolen = `${grantSrc}\n${schedSrc}`;
  assert.match(stolen, /default deny/i);
  assert.match(stolen, /thumbgate\.app/);
  assert.match(stolen, /laptop sleep is the fail/i);
  assert.doesNotMatch(stolen, /RUN ON|Cloud vs Local|phone leash|Team \$49|Data never leaves your computer/i);
  assert.doesNotMatch(stolen, /8 memory types|episodic, semantic|Continuity as a public/i);
  assert.doesNotMatch(publicCopy, /Cloud vs Local|RUN ON/);
  assert.match(publicCopy, /There is no phone leash/);
});
