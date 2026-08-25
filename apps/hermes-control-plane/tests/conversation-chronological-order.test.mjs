import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);

// 2026-08-21 user report: "why is the latest output not at the bottom? confusing UX!"
// The tasks API + optimistic state are newest-first. The conversation timeline must
// render oldest→newest so the latest exchange sits at the BOTTOM next to the composer.
test("conversation timeline sorts tasks oldest-to-newest before rendering", () => {
  const helper = fs.readFileSync(
    path.join(import.meta.dirname, "../lib/dashboard-task-order.ts"),
    "utf8",
  );
  assert.match(
    source,
    /mergeThreadTimeline\(\{[\s\S]*snapshot: threadDetails\?\.snapshot \?\? \[\][\s\S]*tasks: threadDetails\?\.tasks \?\? \[\]/,
    "conversation must derive an ascending-by-createdAt timeline",
  );
  assert.match(
    helper,
    /left\.createdAt - right\.createdAt/,
    "task order helper must sort ascending by createdAt",
  );
});

test("conversation never sorts the tasks array in place (non-mutating)", () => {
  assert.doesNotMatch(
    source,
    /threadDetails\?\.tasks\.sort\(/,
    "must copy with [...] before sorting, never mutate threadDetails.tasks",
  );
});
