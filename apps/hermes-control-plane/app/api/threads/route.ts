import { requireSession } from "@/lib/auth";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";
import { clearThreads, deleteThread, renameThread, ThreadOperationError } from "@/lib/thread-operations";

function operationError(error: unknown): Response {
  return error instanceof ThreadOperationError
    ? jsonError(error.message, error.status)
    : jsonError("chat operation failed", 500);
}

export async function GET() {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const rows = await db().prepare(
    `SELECT t.id, COALESCE(t.title_override, t.title) AS title, t.source, t.model, t.preview, t.message_count AS messageCount,
            t.source_session_id AS sourceSessionId, t.created_at AS createdAt,
            COALESCE(t.source_updated_at, t.updated_at) AS updatedAt,
            t.synced_at AS syncedAt, d.name AS deviceName, COUNT(k.id) AS taskCount
       FROM threads t LEFT JOIN tasks k ON k.thread_id = t.id
       LEFT JOIN devices d ON d.id = t.device_id
      WHERE t.organization_id = ? AND t.deleted_at IS NULL GROUP BY t.id
      ORDER BY COALESCE(t.source_updated_at, t.updated_at) DESC, t.id DESC LIMIT 100`
  ).bind(session.organizationId).all();
  return Response.json({ threads: rows.results });
}

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as { title?: string } | null;
  const title = payload?.title?.trim().slice(0, 100);
  if (!title) return jsonError("title is required");
  const id = crypto.randomUUID();
  const now = Date.now();
  await db().prepare(
    "INSERT INTO threads (id, organization_id, title, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, session.organizationId, title, session.userId, now, now).run();
  return Response.json({ thread: { id, title, createdAt: now, updatedAt: now } }, { status: 201 });
}

export async function PATCH(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as { threadId?: string; title?: string } | null;
  if (!payload?.threadId) return jsonError("threadId is required");
  try {
    const result = await renameThread({
      organizationId: session.organizationId,
      userId: session.userId,
      threadId: payload.threadId,
      title: payload.title ?? "",
    });
    return Response.json({ ok: true, title: result.title, operationId: result.operationId },
      { status: result.operationId ? 202 : 200 });
  } catch (error) {
    return operationError(error);
  }
}

export async function DELETE(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as {
    threadId?: string;
    scope?: string;
    confirmation?: string;
  } | null;
  try {
    if (payload?.scope === "all") {
      if (payload.confirmation !== "CLEAR ALL CHATS") return jsonError("clear-all confirmation is required", 409);
      const result = await clearThreads({ organizationId: session.organizationId, userId: session.userId });
      return Response.json({ ok: true, ...result }, { status: result.operationIds.length ? 202 : 200 });
    }
    if (!payload?.threadId) return jsonError("threadId is required");
    const result = await deleteThread({
      organizationId: session.organizationId,
      userId: session.userId,
      threadId: payload.threadId,
    });
    return Response.json({ ok: true, operationId: result.operationId },
      { status: result.operationId ? 202 : 200 });
  } catch (error) {
    return operationError(error);
  }
}
