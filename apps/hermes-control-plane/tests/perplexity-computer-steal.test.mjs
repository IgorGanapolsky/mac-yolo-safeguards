import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loop = readFileSync(new URL("../app/GiveWorkLoop.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const signals = readFileSync(new URL("../app/FunnelSignals.tsx", import.meta.url), "utf8");
const analytics = readFileSync(
  new URL("../app/api/analytics/event/route.ts", import.meta.url),
  "utf8",
);
const llms = readFileSync(new URL("../app/llms.txt/route.ts", import.meta.url), "utf8");

const forbidden = [
  /Gmail, Slack, Notion/,
  /hours or even months/,
  /ThumbGate Wake/,
  /QoderWork/,
  /RUN ON/,
]

test("steals Computer task-first loop, not their product", () => {
  assert.match(page, /<GiveWorkLoop/);
  assert.match(loop, /Give hosted Hermes a job/);
  assert.match(loop, /Hosted Hermes works/);
  assert.match(loop, /Iterate and approve/);
  assert.match(loop, /laptop sleeps/);
  assert.match(loop, /Put hosted Hermes to work/);
  assert.match(loop, /Chats answer\. Hosted Hermes keeps working/);
  assert.match(loop, /Work that survives sleep/);
  assert.match(loop, /Approvals in this browser/);
  assert.match(loop, /One always-on agent/);
  assert.match(loop, /Not a connector wall/);
  assert.match(page, /How do I give it a job\?/);
  for (const pattern of forbidden) {
    assert.doesNotMatch(loop, pattern);
  }
  assert.doesNotMatch(page, /Perplexity|Comet/);
});

test("example jobs are honest hosted-Hermes work, not invented traction", () => {
  assert.match(loop, /id: "overnight-job"/);
  assert.match(loop, /id: "sleep-survive"/);
  assert.match(loop, /id: "force-push-gate"/);
  assert.match(loop, /Keep this coding agent running overnight/);
  assert.match(loop, /Keep working after the laptop sleeps/);
  assert.match(loop, /Stop before git push --force/);
  assert.doesNotMatch(loop, /28 days|78 Tasks|Big Mac Index|DOGE layoffs/);
  assert.doesNotMatch(loop, /data-funnel-event="cloud_continuity_click"/);
});

test("example and closer CTAs emit allowlisted funnel events with cta ids", () => {
  assert.match(loop, /data-funnel-event="task_example_click"/);
  assert.match(loop, /data-funnel-event="give_work_click"/);
  assert.match(loop, /data-cta-id=\{example\.id\}/);
  assert.match(loop, /data-cta-id="put-hosted-hermes-to-work"/);
  assert.match(analytics, /"task_example_click"/);
  assert.match(analytics, /"give_work_click"/);
  assert.match(signals, /sanitizeAttributionToken/);
  assert.match(signals, /dataset\.ctaId/);
  assert.equal(
    (page.match(/href="\/api\/auth\/login" className="button button-primary" data-funnel-event="cloud_continuity_click"/g) ?? []).length,
    3,
  );
});

test("llms.txt answers how to give it a job", () => {
  assert.match(llms, /How do I give it a job\?/);
  assert.match(llms, /type the job in the dashboard/);
  assert.doesNotMatch(llms, /Perplexity|connector marketplace/);
});
