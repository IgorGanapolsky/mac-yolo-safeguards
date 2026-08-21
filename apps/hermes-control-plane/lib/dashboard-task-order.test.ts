import { describe, expect, it } from "vitest";
import { orderTasksChronologically } from "./dashboard-task-order";

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
