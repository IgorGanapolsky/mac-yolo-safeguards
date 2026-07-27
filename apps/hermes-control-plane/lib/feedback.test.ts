import { describe, expect, it } from "vitest";
import { cleanFeedbackNote, cleanFeedbackSignal, cleanTaskIds } from "./feedback";

describe("response feedback normalization", () => {
  it("accepts only mutually exclusive thumb signals", () => {
    expect(cleanFeedbackSignal("up")).toBe("up");
    expect(cleanFeedbackSignal("down")).toBe("down");
    expect(cleanFeedbackSignal("maybe")).toBeNull();
  });

  it("normalizes bounded actionable notes", () => {
    expect(cleanFeedbackNote("  Use\nmore   evidence  ")).toBe("Use more evidence");
    expect(cleanFeedbackNote("\u0000")).toBeNull();
    expect(cleanFeedbackNote("x".repeat(1_200))).toHaveLength(1_000);
  });

  it("deduplicates and bounds task ids", () => {
    expect(cleanTaskIds("task-1, task-1, bad id, task_2")).toEqual(["task-1", "task_2"]);
    expect(cleanTaskIds(Array.from({ length: 120 }, (_, index) => `task-${index}`).join(","))).toHaveLength(100);
  });
});
