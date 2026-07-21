import { requireSession } from "@/lib/auth";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export async function GET() {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const rows = await db().prepare(
    `SELECT t.id, t.title, t.source, t.model, t.preview, t.message_count AS messageCount,
            t.source_session_id AS sourceSessionId, t.created_at AS createdAt, t.updated_at AS updatedAt,
            t.synced_at AS syncedAt, d.name AS deviceName, COUNT(k.id) AS taskCount
       FROM threads t LEFT JOIN tasks k ON k.thread_id = t.id
       LEFT JOIN devices d ON d.id = t.device_id
      WHERE t.organization_id = ? GROUP BY t.id ORDER BY t.updated_at DESC, t.id DESC LIMIT 100`
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
