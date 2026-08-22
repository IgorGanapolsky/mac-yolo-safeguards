export interface ExecutionStatuslineRow {
  taskId: string;
  status: string;
  route: string;
  model?: unknown;
  createdAt?: unknown;
  completedAt?: unknown;
  metadata?: unknown;
}

export interface ExecutionStatusline {
  taskId: string;
  status: string;
  engine: string;
  model: string | null;
  durationMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  ttftMs: number | null;
  costUsd: number | null;
  completedAt: number | null;
}

function measuredNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function metric(metadata: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = measuredNumber(metadata[key]);
    if (value !== null) return value;
  }
  return null;
}

export function buildExecutionStatusline(row: ExecutionStatuslineRow): ExecutionStatusline {
  const metadata = metadataObject(row.metadata);
  const createdAt = measuredNumber(row.createdAt);
  const completedAt = measuredNumber(row.completedAt);
  const auditedDuration = metric(metadata, "durationMs", "duration_ms", "latencyMs", "latency_ms");
  const elapsed = createdAt !== null && completedAt !== null && completedAt >= createdAt
    ? completedAt - createdAt
    : null;
  const rawModel = typeof row.model === "string" ? row.model.trim().slice(0, 120) : "";

  return {
    taskId: row.taskId,
    status: row.status,
    engine: row.route === "cloud" ? "Hosted Hermes" : row.route === "local" ? "Local Hermes" : "Hermes",
    model: rawModel || null,
    durationMs: auditedDuration ?? elapsed,
    promptTokens: metric(metadata, "promptTokens", "prompt_tokens"),
    completionTokens: metric(metadata, "completionTokens", "completion_tokens"),
    ttftMs: metric(metadata, "ttftMs", "ttft_ms", "timeToFirstTokenMs", "time_to_first_token_ms"),
    costUsd: metric(metadata, "costUsd", "cost_usd"),
    completedAt,
  };
}

export function formatLatency(value: number | null): string {
  if (value === null) return "—";
  if (value < 1_000) return `${Math.round(value)}ms`;
  return `${Number((value / 1_000).toFixed(1))}s`;
}

function compactNumber(value: number): string {
  if (value < 1_000) return String(Math.round(value));
  return `${Number((value / 1_000).toFixed(1))}k`;
}

export function formatTokens(promptTokens: number | null, completionTokens: number | null): string {
  if (promptTokens === null && completionTokens === null) return "—";
  const prompt = promptTokens ?? 0;
  const completion = completionTokens ?? 0;
  return `${compactNumber(prompt + completion)} · ${compactNumber(prompt)} in / ${compactNumber(completion)} out`;
}

export function formatCost(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "$0.00";
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}
