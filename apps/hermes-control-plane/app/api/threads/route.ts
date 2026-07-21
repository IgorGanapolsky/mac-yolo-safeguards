import { requireSession } from "@/lib/auth";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export async function GET() {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const rows = await db().prepare(
    `SELECT t.id, t.title, t.source, t.model, t.preview, t.message_count AS messageCount,
            t.source_session_id AS sourceSessionId, t.created_at AS createdAt,
            COALESCE(t.source_updated_at, t.updated_at) AS updatedAt,
            t.synced_at AS syncedAt, d.name AS deviceName, COUNT(k.id) AS taskCount
       FROM threads t LEFT JOIN tasks k ON k.thread_id = t.id
       LEFT JOIN devices d ON d.id = t.device_id
      WHERE t.organization_id = ? GROUP BY t.id
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
  const threadId = payload?.threadId?.trim();
  const title = payload?.title?.trim().slice(0, 100);
  if (!threadId) return jsonError("threadId is required");
  if (!title) return jsonError("title is required");
  const now = Date.now();
  const result = await db().prepare(
    "UPDATE threads SET title = ?, updated_at = ? WHERE id = ? AND organization_id = ?"
  ).bind(title, now, threadId, session.organizationId).run();
  if (!result.meta.changes) return jsonError("thread not found", 404);
  return Response.json({ thread: { id: threadId, title, updatedAt: now } });
}

export async function DELETE(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const url = new URL(request.url);
  const threadId = url.searchParams.get("id")?.trim();
  const clearAll = url.searchParams.get("all") === "true";
  if (!threadId && !clearAll) return jsonError("id is required");

  if (clearAll) {
    await db().batch([
      db().prepare("DELETE FROM tasks WHERE organization_id = ?").bind(session.organizationId),
      db().prepare("DELETE FROM threads WHERE organization_id = ?").bind(session.organizationId),
    ]);
    return Response.json({ cleared: true });
  }

  // organization_id scoping on BOTH deletes is the actual authorization check here —
  // a thread id from another org simply matches zero rows rather than needing a
  // separate ownership lookup.
  const [, threadDelete] = await db().batch([
    db().prepare("DELETE FROM tasks WHERE thread_id = ? AND organization_id = ?").bind(threadId, session.organizationId),
    db().prepare("DELETE FROM threads WHERE id = ? AND organization_id = ?").bind(threadId, session.organizationId),
  ]);
  if (!threadDelete.meta.changes) return jsonError("thread not found", 404);
  return Response.json({ deleted: true });
}
