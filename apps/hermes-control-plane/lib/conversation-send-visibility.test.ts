import { describe, expect, it } from "vitest";
import {
  hasPendingConversationTasks,
  mergeConversationTasks,
  mergeTasksForTaskList,
  preferRicherTask,
  pruneResolvedOptimistic,
  taskProgressRank,
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

  it("keeps a previous completed reply when a later fetch omits the same prompt", () => {
    const previous = [task({ id: "uuid", prompt: "zyvop reddit?", status: "completed", result: "Direct answer" })];
    const optimistic = [task({ id: "pending-1", prompt: "zyvop reddit?", status: "cloud_pending" })];
    const result = mergeConversationTasks([], optimistic, previous);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("completed");
    expect(result[0].result).toBe("Direct answer");
  });
});

describe("pruneResolvedOptimistic", () => {
  it("drops ids that landed on the server", () => {
    const optimistic = [task({ id: "b", prompt: "just sent" }), task({ id: "c", prompt: "still pending" })];
    const server = [task({ id: "b", prompt: "just sent", status: "running" })];
    expect(pruneResolvedOptimistic(optimistic, server).map((row) => row.id)).toEqual(["c"]);
  });

  it("drops optimistic CLOUD PENDING when the server completed the same prompt under another id", () => {
    const optimistic = [task({ id: "pending-1", prompt: "Are you constantly engaging in zyvop?", status: "cloud_pending" })];
    const server = [task({
      id: "4b2e57f3",
      prompt: "Are you constantly engaging in zyvop?",
      status: "completed",
      result: "Not constantly",
    })];
    expect(pruneResolvedOptimistic(optimistic, server)).toEqual([]);
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

  it("does not regress a completed row to CLOUD PENDING when a stale GET omits it", () => {
    const previous = [{
      id: "4b2e57f3",
      threadId: "real-estate",
      threadTitle: "Real Estate",
      prompt: "Are you constantly engaging in zyvop, bigger pockets, reddit, skool????",
      status: "completed",
      route: "cloud",
      result: "Direct answer: Not constantly",
      error: null,
      createdAt: 1787508628108,
      updatedAt: 1787508667006,
      completedAt: 1787508667006,
      deviceName: null,
    }];
    const staleServer = [{
      id: "older",
      threadId: "real-estate",
      threadTitle: "Real Estate",
      prompt: "older",
      status: "completed",
      route: "cloud",
      result: "done",
      error: null,
      createdAt: 1,
      updatedAt: 1,
      completedAt: 1,
      deviceName: null,
    }];
    const optimistic = [task({
      id: "4b2e57f3",
      prompt: "Are you constantly engaging in zyvop, bigger pockets, reddit, skool????",
      status: "cloud_pending",
    })];
    const result = mergeTasksForTaskList(staleServer, optimistic, "real-estate", previous);
    const stuck = result.find((row) => row.id === "4b2e57f3");
    expect(stuck?.status).toBe("completed");
    expect(stuck?.result).toContain("Direct answer");
    expect(result.filter((row) => row.status === "cloud_pending")).toHaveLength(0);
  });
});

describe("preferRicherTask", () => {
  it("never lets pending beat a completed result", () => {
    expect(taskProgressRank({ status: "cloud_pending", result: null })).toBe(0);
    const richer = preferRicherTask(
      { status: "completed", result: "done" },
      { status: "cloud_pending", result: null },
    );
    expect(richer.status).toBe("completed");
    expect(richer.result).toBe("done");
  });
});
