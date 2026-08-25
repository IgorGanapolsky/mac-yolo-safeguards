import assert from "node:assert/strict";
import test from "node:test";
import { buildThreadTimeline } from "../lib/thread-timeline.ts";

const AUG23 = Date.parse("2026-08-23T18:10:28Z"); // task "Real Estate"
const AUG25 = Date.parse("2026-08-25T12:32:35Z"); // synced user message

test("the reported inversion: a newer synced message must not sit above an older task", () => {
  // Exactly the 2026-08-25 screenshot: a message synced at 08:32 on Aug 25
  // rendered ABOVE a task completed 14:10 on Aug 23, because snapshot and tasks
  // were emitted as two consecutive blocks.
  const timeline = buildThreadTimeline(
    [{ role: "user", content: "we need to reach our goal", createdAt: AUG25 }],
    [{ id: "t-real-estate", prompt: "Are you constantly engaging...", createdAt: AUG23 }],
  );
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].kind, "task", "the Aug 23 task belongs first");
  assert.equal(timeline[1].kind, "snapshot", "the Aug 25 message belongs last");
});

test("newest entry is always last, next to the composer", () => {
  const timeline = buildThreadTimeline(
    [{ role: "user", content: "older", createdAt: 1_000 }],
    [{ id: "b", prompt: "newest", createdAt: 9_000 }, { id: "a", prompt: "middle", createdAt: 5_000 }],
  );
  const times = timeline.map((e) => e.at);
  assert.deepEqual(times, [1_000, 5_000, 9_000]);
  assert.equal(times[times.length - 1], Math.max(...times));
});

test("tasks arriving newest-first from the API are still ordered oldest to newest", () => {
  // The tasks route is ORDER BY created_at DESC, and optimistic rows are
  // prepended, so input order is not chronological.
  const timeline = buildThreadTimeline([], [
    { id: "c", prompt: "third", createdAt: 300 },
    { id: "b", prompt: "second", createdAt: 200 },
    { id: "a", prompt: "first", createdAt: 100 },
  ]);
  assert.deepEqual(timeline.map((e) => e.at), [100, 200, 300]);
});

test("an optimistic row prepended to newest-first server rows lands in the right place", () => {
  const timeline = buildThreadTimeline([], [
    { id: "optimistic", prompt: "just sent", createdAt: 250 },
    { id: "c", prompt: "third", createdAt: 300 },
    { id: "a", prompt: "first", createdAt: 100 },
  ]);
  assert.deepEqual(timeline.map((e) => e.at), [100, 250, 300]);
});

test("snapshot messages without a timestamp keep order and stay ahead, not invented", () => {
  const timeline = buildThreadTimeline(
    [
      { role: "user", content: "no time A" },
      { role: "assistant", content: "no time B" },
      { role: "user", content: "dated", createdAt: 500 },
    ],
    [{ id: "t", prompt: "task", createdAt: 400 }],
  );
  assert.deepEqual(
    timeline.map((e) => (e.kind === "snapshot" ? e.message.content : e.task.prompt)),
    ["no time A", "no time B", "task", "dated"],
  );
});

test("ties are stable and a synced prompt reads before the work it produced", () => {
  const timeline = buildThreadTimeline(
    [{ role: "user", content: "prompt", createdAt: 700 }],
    [{ id: "t", prompt: "work", createdAt: 700 }],
  );
  assert.equal(timeline[0].kind, "snapshot");
  assert.equal(timeline[1].kind, "task");
});

test("the inputs are never mutated", () => {
  const snapshot = [{ role: "user", content: "b", createdAt: 2 }];
  const tasks = [{ id: "y", prompt: "y", createdAt: 3 }, { id: "x", prompt: "x", createdAt: 1 }];
  const snapCopy = JSON.parse(JSON.stringify(snapshot));
  const taskCopy = JSON.parse(JSON.stringify(tasks));
  buildThreadTimeline(snapshot, tasks);
  assert.deepEqual(snapshot, snapCopy, "snapshot untouched");
  assert.deepEqual(tasks, taskCopy, "tasks untouched — still rendered elsewhere");
});

test("empty and malformed input do not throw or fabricate entries", () => {
  assert.deepEqual(buildThreadTimeline(), []);
  assert.deepEqual(buildThreadTimeline([], []), []);
  const withBad = buildThreadTimeline([], [{ id: "bad", prompt: "x", createdAt: Number.NaN }]);
  assert.deepEqual(withBad, [], "a task with no usable time is dropped, not placed arbitrarily");
});
