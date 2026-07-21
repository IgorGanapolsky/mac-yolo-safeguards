import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";
import { buildThumbgateCaptureBody, sendThumbgateFeedback } from "@/lib/thumbgate-feedback";

export async function GET(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const threadId = new URL(request.url).searchParams.get("thread_id");
  if (!threadId) return jsonError("thread_id is required");
  const rows = await db().prepare(
    `SELECT task_id AS taskId, snapshot_index AS snapshotIndex, signal
       FROM feedback_events WHERE organization_id = ? AND thread_id = ? AND user_id = ?`
  ).bind(session.organizationId, threadId, session.userId).all();
  return Response.json({ feedback: rows.results });
}

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as {
    threadId?: string;
    taskId?: string;
    snapshotIndex?: number;
    signal?: string;
    content?: string;
  } | null;

  const threadId = payload?.threadId;
  const signal = payload?.signal;
  const content = payload?.content?.trim().slice(0, 4000) ?? "";
  const hasTaskId = typeof payload?.taskId === "string" && payload.taskId.length > 0;
  const hasSnapshotIndex = typeof payload?.snapshotIndex === "number" && Number.isInteger(payload.snapshotIndex);
  if (!threadId) return jsonError("threadId is required");
  if (signal !== "up" && signal !== "down") return jsonError("signal must be up or down");
  if (hasTaskId === hasSnapshotIndex) return jsonError("exactly one of taskId or snapshotIndex is required");

  const thread = await db().prepare(
    "SELECT id, COALESCE(title_override, title) AS title FROM threads WHERE id = ? AND organization_id = ? AND deleted_at IS NULL"
  ).bind(threadId, session.organizationId).first<{ id: string; title: string }>();
  if (!thread) return jsonError("thread not found", 404);

  const taskId = hasTaskId ? payload!.taskId! : null;
  const snapshotIndex = hasSnapshotIndex ? payload!.snapshotIndex! : null;
  const id = `${session.organizationId}:${threadId}:${taskId ?? `s${snapshotIndex}`}:${session.userId}`;

  const captureBody = buildThumbgateCaptureBody({ signal, threadTitle: thread.title, messageContent: content });
  const remote = await sendThumbgateFeedback(captureBody);

  const now = Date.now();
  await db().prepare(
    `INSERT INTO feedback_events
       (id, organization_id, user_id, thread_id, task_id, snapshot_index, signal, context, remote_status, remote_feedback_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       signal = excluded.signal, context = excluded.context,
       remote_status = excluded.remote_status, remote_feedback_id = excluded.remote_feedback_id,
       created_at = excluded.created_at`
  ).bind(
    id, session.organizationId, session.userId, threadId, taskId, snapshotIndex,
    signal, captureBody.context, remote.status, remote.remoteFeedbackId ?? null, now
  ).run();

  await audit({
    organizationId: session.organizationId, actorType: "user", actorId: session.userId,
    action: "feedback.capture", targetType: "thread", targetId: threadId,
    metadata: { signal, taskId, snapshotIndex, remoteStatus: remote.status },
  });

  return Response.json({ ok: true, remoteStatus: remote.status }, { status: 201 });
}
