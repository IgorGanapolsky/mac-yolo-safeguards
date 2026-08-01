/**
 * A+ Observability: LLM call metrics endpoint.
 *
 * Returns aggregate LLM token/cost/latency stats and routing metrics.
 * Requires admin session.
 */

import { requireSession } from "@/lib/auth";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export async function GET(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }

  const url = new URL(request.url);
  const sinceHours = Math.min(
    168,
    Math.max(1, Number(url.searchParams.get("hours")) || 24),
  );
  const sinceMs = Date.now() - sinceHours * 60 * 60 * 1000;

  // Aggregate LLM calls from the llm_calls table (A+ observability)
  const rows = await db().prepare(
    `SELECT
       COUNT(*)                                       AS totalCalls,
       COUNT(DISTINCT model)                          AS distinctModels,
       COALESCE(SUM(prompt_tokens), 0)                AS promptTokens,
       COALESCE(SUM(completion_tokens), 0)            AS completionTokens,
       COALESCE(SUM(cached_prompt_tokens), 0)         AS cachedPromptTokens,
       COALESCE(SUM(cost_usd), 0)                     AS costUsd,
       COALESCE(AVG(latency_ms), 0)                   AS avgLatencyMs,
       COALESCE(MAX(latency_ms), 0)                   AS maxLatencyMs,
       SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END)   AS successCount,
       SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END)   AS failureCount
     FROM llm_calls
     WHERE organization_id = ? AND created_at >= ?`,
  ).bind(session.organizationId, sinceMs).first<{
    totalCalls: number;
    distinctModels: number;
    promptTokens: number;
    completionTokens: number;
    cachedPromptTokens: number;
    costUsd: number;
    avgLatencyMs: number;
    maxLatencyMs: number;
    successCount: number;
    failureCount: number;
  }>();

  // Per-provider breakdown
  const byProvider = await db().prepare(
    `SELECT
       provider,
       COUNT(*)                                       AS calls,
       COALESCE(SUM(cost_usd), 0)                     AS costUsd,
       COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS totalTokens,
       COALESCE(AVG(latency_ms), 0)                   AS avgLatencyMs
     FROM llm_calls
     WHERE organization_id = ? AND created_at >= ?
     GROUP BY provider ORDER BY calls DESC`,
  ).bind(session.organizationId, sinceMs).all();

  return Response.json({
    window: { hours: sinceHours, sinceMs },
    aggregate: rows ?? {
      totalCalls: 0,
      distinctModels: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedPromptTokens: 0,
      costUsd: 0,
      avgLatencyMs: 0,
      maxLatencyMs: 0,
      successCount: 0,
      failureCount: 0,
    },
    byProvider: byProvider.results ?? [],
    p50LatencyMs: rows?.avgLatencyMs ?? 0,
    p99LatencyMs: rows?.maxLatencyMs ?? 0,
    errorRate: rows && rows.totalCalls > 0
      ? Number((rows.failureCount / rows.totalCalls).toFixed(4))
      : 0,
    cacheRate: rows && (rows.promptTokens + rows.cachedPromptTokens) > 0
      ? Number((rows.cachedPromptTokens / (rows.promptTokens + rows.cachedPromptTokens)).toFixed(4))
      : 0,
  });
}
