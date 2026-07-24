import { requireSession } from "@/lib/auth";
import { cleanFeedbackSignal } from "@/lib/feedback";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export async function GET(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const url = new URL(request.url);
  const signal = cleanFeedbackSignal(url.searchParams.get("signal"));
  const query = url.searchParams.get("q")?.replaceAll("\u0000", "").trim().slice(0, 120) ?? "";
  const signalClause = signal ? " AND f.signal = ?" : "";
  const queryClause = query ? " AND (LOWER(k.prompt) LIKE ? OR LOWER(k.result) LIKE ? OR LOWER(COALESCE(f.note, '')) LIKE ?)" : "";
  const values: unknown[] = [session.organizationId];
  if (signal) values.push(signal);
  if (query) {
    const pattern = `%${query.toLowerCase()}%`;
    values.push(pattern, pattern, pattern);
  }
  const rows = await db().prepare(
    `SELECT f.id, f.task_id AS taskId, f.signal, f.note, f.updated_at AS updatedAt,
            k.prompt, k.result, k.route, k.completed_at AS completedAt,
            COALESCE(t.title_override, t.title) AS threadTitle
       FROM response_feedback f
       JOIN tasks k ON k.id = f.task_id AND k.organization_id = f.organization_id
       JOIN threads t ON t.id = k.thread_id
      WHERE f.organization_id = ?${signalClause}${queryClause}
      ORDER BY f.updated_at DESC, f.id DESC LIMIT 200`
  ).bind(...values).all();
  const counts = await db().prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN signal = 'up' THEN 1 ELSE 0 END) AS up,
            SUM(CASE WHEN signal = 'down' THEN 1 ELSE 0 END) AS down
       FROM response_feedback WHERE organization_id = ?`
  ).bind(session.organizationId).first<{ total: number; up: number | null; down: number | null }>();
  /** Activity is NOT the same as lessons — chats/tasks can exist with zero thumbs. */
  const activity = await db().prepare(
    `SELECT
       (SELECT COUNT(*) FROM threads WHERE organization_id = ? AND deleted_at IS NULL) AS threads,
       (SELECT COUNT(*) FROM tasks WHERE organization_id = ?) AS tasks,
       (SELECT COUNT(*) FROM tasks WHERE organization_id = ? AND status = 'completed' AND result IS NOT NULL) AS completedResponses,
       (SELECT COUNT(*) FROM tasks k
         WHERE k.organization_id = ?
           AND k.status = 'completed'
           AND k.result IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM response_feedback f
              WHERE f.organization_id = k.organization_id AND f.task_id = k.id
           )) AS unratedCompleted`
  ).bind(
    session.organizationId,
    session.organizationId,
    session.organizationId,
    session.organizationId,
  ).first<{
    threads: number;
    tasks: number;
    completedResponses: number;
    unratedCompleted: number;
  }>();
  return Response.json({
    lessons: rows.results,
    counts: { total: counts?.total ?? 0, up: counts?.up ?? 0, down: counts?.down ?? 0 },
    activity: {
      threads: activity?.threads ?? 0,
      tasks: activity?.tasks ?? 0,
      completedResponses: activity?.completedResponses ?? 0,
      unratedCompleted: activity?.unratedCompleted ?? 0,
    },
  });
}
