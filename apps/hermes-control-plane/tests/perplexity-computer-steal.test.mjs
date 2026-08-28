import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const detailPage = readFileSync(new URL("../app/how-it-works/page.tsx", import.meta.url), "utf8");
const signals = readFileSync(new URL("../app/FunnelSignals.tsx", import.meta.url), "utf8");
const analytics = readFileSync(
  new URL("../app/api/analytics/event/route.ts", import.meta.url),
  "utf8",
);
const llms = readFileSync(new URL("../app/llms.txt/route.ts", import.meta.url), "utf8");

test("keeps one concise Give-work CTA and moves the full loop to the product tour", () => {
  assert.match(page, /href="\/how-it-works#example-tasks"/);
  assert.match(page, /id="example-tasks"/);
  assert.match(page, /data-cta-id="watch-ci"/);
  assert.match(detailPage, /id="example-tasks"/);
  assert.match(detailPage, /Give hosted Hermes a job/);
  assert.match(detailPage, /Hosted Hermes works/);
  assert.match(detailPage, /Iterate and approve/);
  assert.doesNotMatch(detailPage, /<GiveWorkLoop/);
  assert.doesNotMatch(detailPage, /Gmail, Slack, Notion/);
  assert.doesNotMatch(detailPage, /ThumbGate Wake/);
});

test("example jobs are clickable logins with per-job cta ids", () => {
  assert.match(detailPage, /data-funnel-event="example_task_click"/);
  assert.match(detailPage, /data-cta-id="watch-ci"/);
  assert.match(detailPage, /data-cta-id="morning-digest"/);
  assert.match(detailPage, /data-cta-id="long-migration"/);
  assert.match(detailPage, /funnelEvent="give_work_click"/);
  assert.match(detailPage, /ctaId="put-hosted-hermes-to-work"/);
  assert.match(analytics, /"example_task_click"/);
  assert.match(analytics, /"give_work_click"/);
  assert.match(signals, /sanitizeAttributionToken/);
  assert.match(signals, /dataset\.ctaId/);
  assert.equal((detailPage.match(/<LandingPricingCtaPaid/g) ?? []).length >= 2, true);
});

test("llms.txt answers how to give it a job", () => {
  assert.match(llms, /How do I give it a job\?/);
  assert.match(llms, /type the job in the dashboard/);
});
