import { describe, expect, it } from "vitest";
import {
  buildExecutionStatusline,
  formatCost,
  formatLatency,
  formatTokens,
} from "./execution-statusline";

describe("buildExecutionStatusline", () => {
  it("uses persisted task evidence and never invents unavailable metrics", () => {
    const statusline = buildExecutionStatusline({
      taskId: "task-1",
      status: "completed",
      route: "cloud",
      model: null,
      createdAt: 1_000,
      completedAt: 3_500,
      metadata: JSON.stringify({ durationMs: 2_500 }),
    });

    expect(statusline).toMatchObject({
      taskId: "task-1",
      engine: "Hosted Hermes",
      model: null,
      durationMs: 2_500,
      promptTokens: null,
      completionTokens: null,
      ttftMs: null,
      costUsd: null,
    });
  });

  it("accepts measured telemetry while rejecting negative and non-finite claims", () => {
    const statusline = buildExecutionStatusline({
      taskId: "task-2",
      status: "completed",
      route: "local",
      model: " qwen3:8b ",
      createdAt: 1_000,
      completedAt: 2_000,
      metadata: JSON.stringify({
        promptTokens: 1_200,
        completionTokens: 80,
        ttftMs: 92,
        durationMs: -1,
        costUsd: "0",
      }),
    });

    expect(statusline).toMatchObject({
      engine: "Local Hermes",
      model: "qwen3:8b",
      durationMs: 1_000,
      promptTokens: 1_200,
      completionTokens: 80,
      ttftMs: 92,
      costUsd: 0,
    });
  });

  it("prefers task-scoped receipt model evidence over mutable thread metadata", () => {
    const statusline = buildExecutionStatusline({
      taskId: "task-3",
      status: "completed",
      route: "cloud",
      model: "stale-thread-model",
      metadata: JSON.stringify({ model: "measured-run-model" }),
    });
    expect(statusline.model).toBe("measured-run-model");
  });

  it("formats compact values without turning unknown into zero", () => {
    expect(formatLatency(null)).toBe("—");
    expect(formatLatency(92)).toBe("92ms");
    expect(formatLatency(2_500)).toBe("2.5s");
    expect(formatTokens(null, null)).toBe("—");
    expect(formatTokens(1_200, 80)).toBe("1.3k · 1.2k in / 80 out");
    expect(formatCost(null)).toBe("—");
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.0042)).toBe("$0.0042");
  });
});
