import assert from "node:assert/strict";
import test from "node:test";
import {
  hideDuplicateTaskList,
  latestChronologicalTask,
  mergeThreadTimeline,
  orderSnapshotChronologically,
  orderTasksChronologically,
} from "../lib/dashboard-task-order.ts";

test("newest-first snapshot is reversed so the latest user turn is last", () => {
  const ordered = orderSnapshotChronologically([
    { role: "user", content: "today", createdAt: 300 },
    { role: "assistant", content: "yesterday", createdAt: 200 },
    { role: "user", content: "older", createdAt: 100 },
  ]);
  assert.deepEqual(ordered.map((message) => message.content), ["older", "yesterday", "today"]);
});

test("hideDuplicateTaskList is true only for an open thread on the default filter", () => {
  assert.equal(hideDuplicateTaskList({ selectedThread: "t1", taskFilter: "all" }), true);
  assert.equal(hideDuplicateTaskList({ selectedThread: null, taskFilter: "all" }), false);
  assert.equal(hideDuplicateTaskList({ selectedThread: "t1", taskFilter: "unrated" }), false);
  assert.equal(
    hideDuplicateTaskList({ selectedThread: "t1", taskFilter: "all", focusedTaskId: "task-1" }),
    false,
  );
});

test("latestChronologicalTask is the last oldest-first row, not visibleTasks[0]", () => {
  const tasks = orderTasksChronologically([
    { id: "new", createdAt: 300 },
    { id: "old", createdAt: 100 },
  ]);
  assert.equal(tasks[0].id, "old");
  assert.equal(latestChronologicalTask(tasks)?.id, "new");
});

test("mergeThreadTimeline puts today's user turn after an older completed card", () => {
  const timeline = mergeThreadTimeline({
    snapshot: [{ role: "user", content: "today", createdAt: 1800 }],
    tasks: [{ id: "old", prompt: "aug 23 card", createdAt: 100 }],
  });
  assert.equal(timeline[0].kind, "task");
  assert.equal(timeline[timeline.length - 1].kind, "snapshot");
  assert.equal(timeline[timeline.length - 1].kind === "snapshot" && timeline[timeline.length - 1].message.content, "today");
});

test("later completed turn that reuses earlier prompt text stays visible", () => {
  const timeline = mergeThreadTimeline({
    snapshot: [{ role: "user", content: "try again", createdAt: 100 }],
    tasks: [{ id: "later", prompt: "try again", createdAt: 500, status: "completed" }],
  });
  assert.equal(timeline.some((item) => item.kind === "task" && item.task.id === "later"), true);
});
