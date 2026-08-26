import { requireSession } from "@/lib/auth";
import {
  summarizeAgentTaskRuns,
  type AgentTaskMetricRow,
} from "@/lib/agentx-task-metrics";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

const TASK_METRICS_SAMPLE_LIMIT = 2_000;

export async function GET(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }

  const url = new URL(request.url);
  const sinceHours = Math.min(
    168,
    Math.max(1, Number(url.searchParams.get("hours")) || 24),
  );
  const nowMs = Date.now();
  const sinceMs = nowMs - sinceHours * 60 * 60 * 1000;

  const query = await db().prepare(
    `SELECT
       id,
       thread_id AS threadId,
       status,
       route,
       created_at AS createdAt,
       completed_at AS completedAt
     FROM tasks
     WHERE organization_id = ? AND created_at >= ?
     ORDER BY created_at DESC
     LIMIT ?`,
  ).bind(session.organizationId, sinceMs, TASK_METRICS_SAMPLE_LIMIT).all();

  const rows = (query.results ?? []) as unknown as AgentTaskMetricRow[];
  const metrics = summarizeAgentTaskRuns(rows, {
    hours: sinceHours,
    nowMs,
    sampleLimit: TASK_METRICS_SAMPLE_LIMIT,
  });

  return Response.json({
    schemaVersion: "agentx-task-metrics/v1",
    source: "task_lifecycle",
    window: { ...metrics.window, sinceMs },
    privacy: {
      contentFieldsRead: false,
      selectedFields: ["id", "thread_id", "status", "route", "created_at", "completed_at"],
    },
    agentic: metrics.agentic,
    latency: metrics.latency,
    contextReuse: metrics.contextReuse,
    performancePerWatt: metrics.performancePerWatt,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
