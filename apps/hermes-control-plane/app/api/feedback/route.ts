import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { cleanFeedbackNote, cleanFeedbackSignal, cleanTaskIds } from "@/lib/feedback";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export async function GET(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const taskIds = cleanTaskIds(new URL(request.url).searchParams.get("task_ids"));
  if (!taskIds.length) return Response.json({ feedback: [] });
  const placeholders = taskIds.map(() => "?").join(",");
  const rows = await db().prepare(
    `SELECT task_id AS taskId, signal, note, updated_at AS updatedAt
       FROM response_feedback
      WHERE organization_id = ? AND user_id = ? AND task_id IN (${placeholders})`
  ).bind(session.organizationId, session.userId, ...taskIds).all();
  return Response.json({ feedback: rows.results });
}

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as { taskId?: string; signal?: unknown; note?: unknown } | null;
  const taskId = payload?.taskId?.trim().slice(0, 160);
  const signal = cleanFeedbackSignal(payload?.signal);
  const note = cleanFeedbackNote(payload?.note);
  if (!taskId) return jsonError("taskId is required");
  if (!signal) return jsonError("signal must be up or down");
  const task = await db().prepare(
    `SELECT id FROM tasks
      WHERE id = ? AND organization_id = ? AND status = 'completed' AND result IS NOT NULL`
  ).bind(taskId, session.organizationId).first<{ id: string }>();
  if (!task) return jsonError("completed response not found", 404);
  const now = Date.now();
  await db().prepare(
    `INSERT INTO response_feedback
      (id, organization_id, user_id, task_id, signal, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(organization_id, user_id, task_id) DO UPDATE SET
       signal = excluded.signal, note = excluded.note, updated_at = excluded.updated_at`
  ).bind(crypto.randomUUID(), session.organizationId, session.userId, taskId, signal, note, now, now).run();
  await audit({ organizationId: session.organizationId, actorType: "user", actorId: session.userId,
    action: "response.feedback.recorded", targetType: "task", targetId: taskId, metadata: { signal, hasNote: Boolean(note) } });
  return Response.json({ feedback: { taskId, signal, note, updatedAt: now } });
}

export async function DELETE(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as { taskId?: string } | null;
  const taskId = payload?.taskId?.trim().slice(0, 160);
  if (!taskId) return jsonError("taskId is required");
  const result = await db().prepare(
    "DELETE FROM response_feedback WHERE organization_id = ? AND user_id = ? AND task_id = ?"
  ).bind(session.organizationId, session.userId, taskId).run();
  if (result.meta.changes) {
    await audit({ organizationId: session.organizationId, actorType: "user", actorId: session.userId,
      action: "response.feedback.removed", targetType: "task", targetId: taskId });
  }
  return Response.json({ removed: Boolean(result.meta.changes) });
}
