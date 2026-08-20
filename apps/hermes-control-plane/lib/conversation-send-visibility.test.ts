import { describe, expect, it } from "vitest";
import {
  hasPendingConversationTasks,
  mergeConversationTasks,
  mergeTasksForTaskList,
  pruneResolvedOptimistic,
  type ConversationTask,
} from "./conversation-send-visibility";

function task(partial: Partial<ConversationTask> & Pick<ConversationTask, "id" | "prompt">): ConversationTask {
  return {
    result: null,
    error: null,
    route: "cloud",
    status: "pending",
    createdAt: 1,
    ...partial,
  };
}

describe("mergeConversationTasks", () => {
  it("keeps optimistic prompt visible until the server row arrives", () => {
    const server = [task({ id: "a", prompt: "older", status: "completed", result: "done" })];
    const optimistic = [task({ id: "b", prompt: "just sent" })];
    expect(mergeConversationTasks(server, optimistic).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("does not duplicate once the server has the same id", () => {
    const server = [task({ id: "b", prompt: "just sent", status: "running" })];
    const optimistic = [task({ id: "b", prompt: "just sent" })];
    expect(mergeConversationTasks(server, optimistic)).toEqual(server);
  });

  it("skips blank optimistic prompts", () => {
    expect(mergeConversationTasks([], [task({ id: "blank", prompt: "   " })])).toEqual([]);
  });
});

describe("pruneResolvedOptimistic", () => {
  it("drops ids that landed on the server", () => {
    const optimistic = [task({ id: "b", prompt: "just sent" }), task({ id: "c", prompt: "still pending" })];
    const server = [task({ id: "b", prompt: "just sent", status: "running" })];
    expect(pruneResolvedOptimistic(optimistic, server).map((row) => row.id)).toEqual(["c"]);
  });
});

describe("hasPendingConversationTasks", () => {
  it("returns true when there are non-blank pending prompts", () => {
    expect(hasPendingConversationTasks([task({ id: "b", prompt: "just sent" })])).toBe(true);
  });

  it("returns false when all pending prompts are blank", () => {
    expect(hasPendingConversationTasks([task({ id: "blank", prompt: "   " })])).toBe(false);
  });

  it("returns false when empty", () => {
    expect(hasPendingConversationTasks([])).toBe(false);
  });
});

describe("mergeTasksForTaskList", () => {
  it("appends optimistic tasks not on the server", () => {
    const server = [{ id: "a", threadId: "t1", threadTitle: "t", prompt: "old", status: "completed", route: "cloud", result: "done", error: null, createdAt: 1, updatedAt: 1, completedAt: 1, deviceName: null }];
    const optimistic = [task({ id: "b", prompt: "just sent" })];
    const result = mergeTasksForTaskList(server, optimistic, "t1");
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("does not duplicate tasks already on the server", () => {
    const server = [{ id: "b", threadId: "t1", threadTitle: "t", prompt: "just sent", status: "running", route: "cloud", result: null, error: null, createdAt: 1, updatedAt: 1, completedAt: null, deviceName: null }];
    const optimistic = [task({ id: "b", prompt: "just sent" })];
    const result = mergeTasksForTaskList(server, optimistic, "t1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("assigns the threadId to optimistic tasks", () => {
    const server = [];
    const optimistic = [task({ id: "c", prompt: "hello" })];
    const result = mergeTasksForTaskList(server, optimistic, "thread-xyz");
    expect(result[0].threadId).toBe("thread-xyz");
  });

  it("skips blank optimistic prompts", () => {
    const server = [];
    const optimistic = [task({ id: "blank", prompt: "   " })];
    const result = mergeTasksForTaskList(server, optimistic, "t");
    expect(result).toHaveLength(0);
  });
});
