import { describe, expect, it } from "vitest";
import { buildRejoinHandoff, formatRejoinHandoffBlock } from "./session-rejoin-core";

describe("buildRejoinHandoff", () => {
  it("returns only tasks after the cloud_rejoined_at watermark", () => {
    const built = buildRejoinHandoff(
      [
        { id: "t1", prompt: "old", result: "old result", createdAt: 100 },
        { id: "t2", prompt: "new user", result: "new assistant", createdAt: 200 },
        { id: "t3", prompt: "newer", result: "newer result", createdAt: 300 },
      ],
      150,
    );
    expect(built.taskIds).toEqual(["t2", "t3"]);
    expect(built.handoffMessages).toEqual([
      { role: "user", content: "new user" },
      { role: "assistant", content: "new assistant" },
      { role: "user", content: "newer" },
      { role: "assistant", content: "newer result" },
    ]);
    expect(built.nextWatermark).toBe(300);
  });

  it("does not treat Mac synced_at semantics — watermark 0 includes all eligible", () => {
    const built = buildRejoinHandoff(
      [{ id: "t1", prompt: "hi", result: "hello", createdAt: 50 }],
      null,
    );
    expect(built.taskIds).toEqual(["t1"]);
    expect(built.nextWatermark).toBe(50);
  });

  it("bounds by character budget without dropping an empty pack when first pair fits", () => {
    const huge = "x".repeat(20_000);
    const built = buildRejoinHandoff(
      [
        { id: "t1", prompt: "a", result: "b", createdAt: 1 },
        { id: "t2", prompt: huge, result: huge, createdAt: 2 },
      ],
      0,
      100,
    );
    expect(built.taskIds).toEqual(["t1"]);
    expect(built.nextWatermark).toBe(1);
  });
});

describe("formatRejoinHandoffBlock", () => {
  it("matches connector claim-time handoff framing", () => {
    const block = formatRejoinHandoffBlock([
      { role: "user", content: "keep going" },
      { role: "assistant", content: "done on VPS" },
    ]);
    expect(block).toMatch(/Cloud\/web continuation since this Mac last synced/);
    expect(block).toContain("user: keep going");
    expect(block).toContain("assistant: done on VPS");
  });

  it("returns empty for no messages", () => {
    expect(formatRejoinHandoffBlock([])).toBe("");
  });
});
