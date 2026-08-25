import { describe, expect, it } from "vitest";
import {
  hideDuplicateTaskList,
  latestChronologicalTask,
  orderSnapshotChronologically,
  orderTasksChronologically,
} from "./dashboard-task-order";

describe("orderTasksChronologically", () => {
  it("puts the newest task at the bottom even when the API returns newest first", () => {
    const tasks = [
      { id: "new", createdAt: 300 },
      { id: "middle", createdAt: 200 },
      { id: "old", createdAt: 100 },
    ];

    expect(orderTasksChronologically(tasks).map((task) => task.id)).toEqual(["old", "middle", "new"]);
  });

  it("puts a prepended optimistic task at the bottom", () => {
    const tasks = [
      { id: "optimistic", createdAt: 400 },
      { id: "old", createdAt: 100 },
      { id: "middle", createdAt: 200 },
    ];

    expect(orderTasksChronologically(tasks).map((task) => task.id)).toEqual(["old", "middle", "optimistic"]);
  });

  it("does not mutate React state and breaks timestamp ties deterministically", () => {
    const tasks = [
      { id: "b", createdAt: 100 },
      { id: "a", createdAt: 100 },
    ];
    const ordered = orderTasksChronologically(tasks);

    expect(ordered.map((task) => task.id)).toEqual(["a", "b"]);
    expect(tasks.map((task) => task.id)).toEqual(["b", "a"]);
    expect(ordered).not.toBe(tasks);
  });
});

describe("orderSnapshotChronologically", () => {
  it("reverses a newest-first snapshot so the latest user turn is last", () => {
    const messages = [
      { role: "user", content: "today", createdAt: 300 },
      { role: "assistant", content: "yesterday", createdAt: 200 },
      { role: "user", content: "older", createdAt: 100 },
    ];
    expect(orderSnapshotChronologically(messages).map((message) => message.content)).toEqual([
      "older",
      "yesterday",
      "today",
    ]);
  });

  it("keeps an undated Hermes snapshot in array order (sync already oldest-first)", () => {
    const messages = [
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
      { role: "user", content: "latest" },
    ];
    expect(orderSnapshotChronologically(messages).map((message) => message.content)).toEqual([
      "first",
      "second",
      "latest",
    ]);
  });
});

describe("hideDuplicateTaskList", () => {
  it("hides the oldest-first card dump while a thread is open", () => {
    expect(hideDuplicateTaskList({ selectedThread: "thread-1", taskFilter: "all" })).toBe(true);
    expect(hideDuplicateTaskList({ selectedThread: null, taskFilter: "all" })).toBe(false);
    expect(hideDuplicateTaskList({ selectedThread: "thread-1", taskFilter: "unrated" })).toBe(false);
  });
});

describe("latestChronologicalTask", () => {
  it("returns the last chronological task, not the oldest", () => {
    expect(latestChronologicalTask([{ id: "old" }, { id: "new" }])?.id).toBe("new");
    expect(latestChronologicalTask([])).toBeNull();
  });
});
