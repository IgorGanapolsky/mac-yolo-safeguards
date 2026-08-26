import { describe, expect, it } from "vitest";
import { summarizeAgentTaskRuns, type AgentTaskMetricRow } from "./agentx-task-metrics";

function row(
  id: string,
  createdAt: number,
  completedAt: number | null,
  status = "completed",
  threadId = "thread-1",
  route = "cloud",
): AgentTaskMetricRow {
  return { id, threadId, status, route, createdAt, completedAt };
}

describe("AgentX-style task metrics", () => {
  it("reports unavailable telemetry as unmeasured instead of zero", () => {
    const result = summarizeAgentTaskRuns([], { hours: 24, nowMs: 10_000, sampleLimit: 2_000 });

    expect(result.latency.e2e).toMatchObject({
      status: "unmeasured",
      samples: 0,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
    });
    expect(result.latency.ttft.status).toBe("unmeasured");
    expect(result.contextReuse.status).toBe("unmeasured");
    expect(result.performancePerWatt.status).toBe("unmeasured");
    expect(result.agentic.successRate).toBeNull();
  });

  it("computes interpolated E2E percentiles from measured task lifetimes", () => {
    const rows = [100, 200, 300, 400, 500].map((duration, index) =>
      row(`task-${index}`, index * 1_000, index * 1_000 + duration),
    );

    const result = summarizeAgentTaskRuns(rows, { hours: 1, nowMs: 10_000, sampleLimit: 2_000 });

    expect(result.latency.e2e).toEqual({
      status: "measured",
      definition: "task_created_to_terminal",
      samples: 5,
      p50Ms: 300,
      p95Ms: 480,
      p99Ms: 496,
      maxMs: 500,
    });
  });

  it("separates outcome coverage from valid latency coverage", () => {
    const result = summarizeAgentTaskRuns([
      row("ok", 0, 100, "completed", "thread-a"),
      row("failed", 100, 250, "failed", "thread-a"),
      row("missing-end", 300, null, "failed", "thread-b"),
      row("bad-clock", 500, 400, "completed", "thread-b"),
      row("running", 600, null, "running", "thread-c"),
    ], { hours: 2, nowMs: 1_000, sampleLimit: 2_000 });

    expect(result.agentic).toMatchObject({
      runs: 5,
      sessions: 3,
      runsPerSession: 1.6667,
      successCount: 2,
      failureCount: 2,
      successRate: 0.5,
      terminalRunsPerHour: 2,
    });
    expect(result.latency.e2e.samples).toBe(2);
  });

  it("counts task-lifetime concurrency without treating touching intervals as overlapping", () => {
    const result = summarizeAgentTaskRuns([
      row("a", 0, 100),
      row("b", 50, 150),
      row("c", 100, 200),
      row("active", 75, null, "running"),
    ], { hours: 1, nowMs: 250, sampleLimit: 2_000 });

    expect(result.agentic.peakConcurrentTaskLifetimes).toBe(3);
  });

  it("marks a bounded sample that reaches its row limit", () => {
    const result = summarizeAgentTaskRuns([
      row("a", 0, 100),
      row("b", 100, 200),
    ], { hours: 1, nowMs: 250, sampleLimit: 2 });

    expect(result.window.sampleLimitReached).toBe(true);
  });
});
