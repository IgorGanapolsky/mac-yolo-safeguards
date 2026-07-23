import { estimateUsageUsdMicros, microsToUsd } from "./model-usage-pricing";
import { db } from "./runtime";

export type ModelUsageInput = {
  organizationId: string;
  taskId?: string | null;
  route: "local" | "cloud";
  model: string;
  provider?: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
};

export { estimateUsageUsdMicros, microsToUsd };

export async function recordModelUsage(input: ModelUsageInput): Promise<void> {
  const prompt = Math.max(0, Math.floor(Number(input.promptTokens) || 0));
  const completion = Math.max(0, Math.floor(Number(input.completionTokens) || 0));
  const total = Math.max(
    0,
    Math.floor(Number(input.totalTokens) || 0) || prompt + completion,
  );
  if (prompt === 0 && completion === 0) return;

  const micros = estimateUsageUsdMicros({ promptTokens: prompt, completionTokens: completion });
  const model = (input.model || "unknown").slice(0, 120);
  const provider = input.provider?.slice(0, 80) ?? null;
  const now = Date.now();

  await db().prepare(
    `INSERT INTO model_usage
      (id, organization_id, task_id, route, model, provider,
       prompt_tokens, completion_tokens, total_tokens, estimated_usd_micros, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    input.organizationId,
    input.taskId ?? null,
    input.route,
    model,
    provider,
    prompt,
    completion,
    total,
    micros,
    now,
  ).run();
}

export type UsageAggregate = {
  rows: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedUsdMicros: number;
};

export async function aggregateModelUsage(sinceMs: number): Promise<UsageAggregate> {
  try {
    const row = await db().prepare(
      `SELECT COUNT(*) AS rows,
              COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
              COALESCE(SUM(completion_tokens), 0) AS completionTokens,
              COALESCE(SUM(total_tokens), 0) AS totalTokens,
              COALESCE(SUM(estimated_usd_micros), 0) AS estimatedUsdMicros
         FROM model_usage
        WHERE created_at >= ?`,
    ).bind(sinceMs).first<{
      rows: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedUsdMicros: number;
    }>();
    return {
      rows: Number(row?.rows ?? 0),
      promptTokens: Number(row?.promptTokens ?? 0),
      completionTokens: Number(row?.completionTokens ?? 0),
      totalTokens: Number(row?.totalTokens ?? 0),
      estimatedUsdMicros: Number(row?.estimatedUsdMicros ?? 0),
    };
  } catch {
    // Table not migrated yet
    return { rows: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedUsdMicros: 0 };
  }
}
