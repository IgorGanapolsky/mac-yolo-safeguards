/**
 * Behavior tests for Improve/Helpful metric navigation.
 * Pure helpers live in lib/lessons-ui.ts — this is the real e2e-of-logic gate
 * (full browser auth E2E is still not in this package's CI).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  hermesTaskHref,
  lessonsListHref,
  parseSignalFromSearch,
  resolveSignalClickDestination,
  singleLessonHermesHref,
  splitHighlightParts,
} from "../lib/lessons-ui.ts";

test("parseSignalFromSearch reads up/down and defaults to all", () => {
  assert.equal(parseSignalFromSearch("?signal=down"), "down");
  assert.equal(parseSignalFromSearch("signal=up&q=foo"), "up");
  assert.equal(parseSignalFromSearch(""), "all");
  assert.equal(parseSignalFromSearch("?signal=nope"), "all");
});

test("lessonsListHref builds filter URLs with #lesson-list", () => {
  assert.equal(lessonsListHref("all"), "/dashboard/lessons#lesson-list");
  assert.equal(lessonsListHref("down"), "/dashboard/lessons?signal=down#lesson-list");
  assert.equal(
    lessonsListHref("up", "token burn"),
    "/dashboard/lessons?signal=up&q=token+burn#lesson-list",
  );
});

test("single Improve rating opens Hermes task deep-link", () => {
  const improve = { taskId: "task-1", threadId: "thread-1", signal: "down" };
  const dest = resolveSignalClickDestination({
    target: "down",
    counts: { up: 0, down: 1 },
    lessons: [improve],
  });
  assert.deepEqual(dest, {
    kind: "open-hermes",
    href: "/dashboard?task=task-1&thread=thread-1#task-activity",
  });
});

test("multiple Improve ratings filter the lessons list", () => {
  const improve = { taskId: "task-1", threadId: "thread-1", signal: "down" };
  const dest = resolveSignalClickDestination({
    target: "down",
    counts: { up: 0, down: 3 },
    lessons: [improve, { ...improve, taskId: "task-9" }],
  });
  assert.deepEqual(dest, { kind: "filter", signal: "down", openSingleWhenLoaded: false });
});

test("count=1 without loaded match filters then opens after load", () => {
  const helpful = { taskId: "task-2", threadId: "thread-2", signal: "up" };
  const dest = resolveSignalClickDestination({
    target: "down",
    counts: { up: 2, down: 1 },
    lessons: [helpful, helpful],
  });
  assert.deepEqual(dest, { kind: "filter", signal: "down", openSingleWhenLoaded: true });

  const afterLoad = singleLessonHermesHref(
    "down",
    [{ taskId: "task-1", threadId: "thread-1", signal: "down" }],
    true,
  );
  assert.equal(afterLoad, hermesTaskHref({ taskId: "task-1", threadId: "thread-1", signal: "down" }));
});

test("All ratings never auto-opens Hermes", () => {
  const dest = resolveSignalClickDestination({
    target: "all",
    counts: { up: 0, down: 1 },
    lessons: [{ taskId: "task-1", threadId: "thread-1", signal: "down" }],
  });
  assert.deepEqual(dest, { kind: "filter", signal: "all", openSingleWhenLoaded: false });
});

test("splitHighlightParts marks case-insensitive query matches", () => {
  const parts = splitHighlightParts("Fix Token Burn today", "token burn");
  assert.ok(parts.some((p) => p.match && p.text.toLowerCase() === "token burn"));
  assert.equal(parts.map((p) => p.text).join(""), "Fix Token Burn today");
});
