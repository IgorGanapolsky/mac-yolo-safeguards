import { describe, expect, it } from "vitest";
import {
  mergeConversationTasks,
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
