import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const signals = readFileSync(new URL("../app/FunnelSignals.tsx", import.meta.url), "utf8");
const analytics = readFileSync(
  new URL("../app/api/analytics/event/route.ts", import.meta.url),
  "utf8",
);
const llms = readFileSync(new URL("../app/llms.txt/route.ts", import.meta.url), "utf8");

test("adds Give/Works/Approve loop on the sibling example-tasks strip", () => {
  assert.match(page, /id="example-tasks"/);
  assert.match(page, /Give hosted Hermes a job/);
  assert.match(page, /Hosted Hermes works/);
  assert.match(page, /Iterate and approve/);
  assert.match(page, /How do I give it a job\?/);
  assert.match(page, /See example jobs/);
  assert.doesNotMatch(page, /<GiveWorkLoop/);
  assert.doesNotMatch(page, /Gmail, Slack, Notion/);
  assert.doesNotMatch(page, /ThumbGate Wake/);
});

test("example jobs are clickable logins with per-job cta ids", () => {
  assert.match(page, /data-funnel-event="example_task_click"/);
  assert.match(page, /data-cta-id="watch-ci"/);
  assert.match(page, /data-cta-id="morning-digest"/);
  assert.match(page, /data-cta-id="long-migration"/);
  assert.match(page, /funnelEvent="give_work_click"/);
  assert.match(page, /ctaId="put-hosted-hermes-to-work"/);
  assert.match(analytics, /"example_task_click"/);
  assert.match(analytics, /"give_work_click"/);
  assert.match(signals, /sanitizeAttributionToken/);
  assert.match(signals, /dataset\.ctaId/);
  assert.equal((page.match(/<LandingPricingCtaPaid/g) ?? []).length >= 3, true);
});

test("llms.txt answers how to give it a job", () => {
  assert.match(llms, /How do I give it a job\?/);
  assert.match(llms, /type the job in the dashboard/);
});
