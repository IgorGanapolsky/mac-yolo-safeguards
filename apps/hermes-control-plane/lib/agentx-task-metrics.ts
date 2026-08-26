export type AgentTaskMetricRow = {
  id: string;
  threadId: string;
  status: string;
  route: string;
  createdAt: number;
  completedAt: number | null;
};

type SummaryOptions = {
  hours: number;
  nowMs: number;
  sampleLimit: number;
};

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finiteTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function percentile(sortedValues: number[], quantile: number): number | null {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return Math.round(
    sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower),
  );
}

function countBy(rows: AgentTaskMetricRow[], field: "status" | "route"): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = row[field] || "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function peakTaskLifetimeConcurrency(rows: AgentTaskMetricRow[], nowMs: number): number {
  const events: Array<{ at: number; delta: 1 | -1 }> = [];
  for (const row of rows) {
    const start = finiteTimestamp(row.createdAt);
    if (start === null) continue;

    const storedEnd = finiteTimestamp(row.completedAt);
    const isTerminal = row.status === "completed" || row.status === "failed";
    const end = storedEnd ?? (isTerminal ? null : nowMs);
    if (end === null || end <= start) continue;

    events.push({ at: start, delta: 1 }, { at: end, delta: -1 });
  }

  events.sort((left, right) => left.at - right.at || left.delta - right.delta);
  let active = 0;
  let peak = 0;
  for (const event of events) {
    active += event.delta;
    peak = Math.max(peak, active);
  }
  return peak;
}

export function summarizeAgentTaskRuns(rows: AgentTaskMetricRow[], options: SummaryOptions) {
  const successCount = rows.filter((row) => row.status === "completed").length;
  const failureCount = rows.filter((row) => row.status === "failed").length;
  const terminalCount = successCount + failureCount;
  const sessions = new Set(rows.map((row) => row.threadId).filter(Boolean)).size;

  const durations = rows.flatMap((row) => {
    if (row.status !== "completed" && row.status !== "failed") return [];
    const start = finiteTimestamp(row.createdAt);
    const end = finiteTimestamp(row.completedAt);
    if (start === null || end === null || end < start) return [];
    return [end - start];
  }).sort((left, right) => left - right);

  const measuredE2e = durations.length > 0;
  const runsPerSession = sessions > 0 ? round(rows.length / sessions) : null;

  return {
    window: {
      hours: options.hours,
      rowsRead: rows.length,
      sampleLimit: options.sampleLimit,
      sampleLimitReached: rows.length >= options.sampleLimit,
    },
    agentic: {
      runs: rows.length,
      sessions,
      runsPerSession,
      successCount,
      failureCount,
      successRate: terminalCount > 0 ? round(successCount / terminalCount) : null,
      terminalRunsPerHour: round(terminalCount / options.hours),
      peakConcurrentTaskLifetimes: peakTaskLifetimeConcurrency(rows, options.nowMs),
      statusCounts: countBy(rows, "status"),
      routeCounts: countBy(rows, "route"),
    },
    latency: {
      e2e: {
        status: measuredE2e ? "measured" : "unmeasured",
        definition: "task_created_to_terminal",
        samples: durations.length,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        p99Ms: percentile(durations, 0.99),
        maxMs: measuredE2e ? durations[durations.length - 1] : null,
      },
      ttft: {
        status: "unmeasured",
        samples: 0,
        reason: "No first-token timestamp is persisted for hosted task runs.",
      },
      queue: {
        status: "unmeasured",
        samples: 0,
        reason: "Task claim timestamps are not joined by this bounded endpoint.",
      },
    },
    contextReuse: {
      status: "unmeasured",
      samples: 0,
      reason: "No deployed model-invocation writer persists prompt or KV-cache reuse.",
    },
    performancePerWatt: {
      status: "unmeasured",
      samples: 0,
      reason: "The hosted VPS does not expose measured per-task energy consumption.",
    },
  } as const;
}
