import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");

test("task cards use chronological order so the newest output is beside the composer", () => {
  assert.match(source, /orderTasksChronologically/);
  assert.match(source, /from "@\/lib\/dashboard-task-order"/);
  assert.match(source, /return orderTasksChronologically\(filtered\)/);
  assert.match(source, /orderSnapshotChronologically/);
  assert.match(source, /hideDuplicateTaskList/);
  assert.match(source, /latestChronologicalTask/);
  assert.doesNotMatch(source, /visibleTasks\.reverse\(/);
  assert.doesNotMatch(source, /threadDetails\?\.snapshot\.map/);
});
