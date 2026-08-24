import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/lessons/LessonsClient.tsx"),
  "utf8",
);

// 2026-08-20 user report: the lessons page never stated that lessons are private,
// so it read like a world-shared feed. Data is org-scoped server-side
// (app/api/lessons/route.ts: WHERE organization_id = ?); the page must SAY so.
test("lessons page affirms the data is private to the workspace", () => {
  assert.match(source, /Private to your workspace/);
  assert.match(source, /never public and never shared with other users/);
});

test("privacy affirmation is honest about org scope, not a false 'only you'", () => {
  assert.match(source, /anyone you add to your\s*\n?\s*organization/);
});
