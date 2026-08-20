import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);

// 2026-08-19 user report: after send, the viewport stayed at the composer while
// the new (newest-first) task row rendered off-screen at the top — the message
// looked lost. The post-send scroll must target the new task's own row.
test("post-send scroll targets the just-created task row, not the output strip", () => {
  assert.match(source, /getElementById\(`task-\$\{optimistic\.id\}`\)/);
  assert.doesNotMatch(
    source,
    /requestAnimationFrame\(\(\) => \{\s*document\.getElementById\("run-output"\)/,
  );
});

test("task rows keep the anchor id the scroll depends on", () => {
  assert.match(source, /id=\{`task-\$\{task\.id\}`\}/);
});
