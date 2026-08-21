import { describe, expect, it } from "vitest";
import { snapshotMessageMeta, taskOutputMeta, taskPromptMeta } from "./conversation-message-meta";

describe("snapshotMessageMeta", () => {
  it("marks assistant snapshots completed and prefers their exact timestamp", () => {
    expect(snapshotMessageMeta({ role: "assistant", createdAt: 200 }, 100)).toEqual({
      status: "completed",
      timestamp: 200,
      timestampSource: "message",
    });
  });

  it("labels a legacy timestamp as thread sync time instead of inventing precision", () => {
    expect(snapshotMessageMeta({ role: "user" }, 100)).toEqual({
      status: "sent",
      timestamp: 100,
      timestampSource: "sync",
    });
  });

  it("marks a sanitized assistant snapshot as incomplete", () => {
    expect(snapshotMessageMeta({
      role: "assistant",
      content: '<|DSML|invoke name="shell">curl example',
    }, 100)).toEqual({
      status: "incomplete",
      timestamp: 100,
      timestampSource: "sync",
    });
  });

  it("omits invalid clocks", () => {
    expect(snapshotMessageMeta({ role: "system", createdAt: Number.NaN }, 0)).toEqual({
      status: "context",
      timestamp: null,
      timestampSource: null,
    });
  });
});

describe("task message metadata", () => {
  const base = { status: "running", createdAt: 100, completedAt: null, result: null, error: null };

  it("marks the submitted prompt sent at task creation", () => {
    expect(taskPromptMeta(base)).toEqual({ status: "sent", timestamp: 100, timestampSource: "task" });
  });

  it("uses completion time for completed output", () => {
    expect(taskOutputMeta({ ...base, status: "completed", result: "ok", completedAt: 250 })).toEqual({
      status: "completed",
      timestamp: 250,
      timestampSource: "task",
    });
  });

  it("uses failure time and failure state for errors", () => {
    expect(taskOutputMeta({ ...base, status: "failed", error: "boom", completedAt: 275 })).toEqual({
      status: "failed",
      timestamp: 275,
      timestampSource: "task",
    });
  });

  it("keeps a running output truthful", () => {
    expect(taskOutputMeta(base)).toEqual({ status: "running", timestamp: 100, timestampSource: "task" });
  });

  it("does not label leaked provider tool protocol as completed", () => {
    expect(taskOutputMeta({
      ...base,
      status: "completed",
      result: '<|DSML|tool_calls><|DSML|invoke name="shell"></|DSML|tool_calls>',
      completedAt: 300,
    })).toEqual({ status: "incomplete", timestamp: 300, timestampSource: "task" });
  });
});
