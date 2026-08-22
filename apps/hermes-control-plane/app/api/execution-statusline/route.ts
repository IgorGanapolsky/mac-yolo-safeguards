import { requireSession } from "@/lib/auth";
import { buildExecutionStatusline, type ExecutionStatuslineRow } from "@/lib/execution-statusline";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export async function GET() {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }

  const row = await db().prepare(
    `SELECT k.id AS taskId, k.status, k.route, NULL AS model,
            k.created_at AS createdAt, k.completed_at AS completedAt,
            (SELECT a.metadata FROM audit_events a
              WHERE a.organization_id = ? AND a.target_type = 'task' AND a.target_id = k.id
                AND a.action IN ('task.completed', 'task.failed')
              ORDER BY a.created_at DESC LIMIT 1) AS metadata
       FROM tasks k
      WHERE k.organization_id = ?
        AND EXISTS (SELECT 1 FROM threads t WHERE t.id = k.thread_id AND t.organization_id = ?)
        AND k.status IN ('completed', 'failed')
      ORDER BY COALESCE(k.completed_at, k.updated_at) DESC LIMIT 1`,
  ).bind(session.organizationId, session.organizationId, session.organizationId).first<ExecutionStatuslineRow>();

  return Response.json(
    { statusline: row ? buildExecutionStatusline(row) : null },
    { headers: { "cache-control": "no-store" } },
  );
}
