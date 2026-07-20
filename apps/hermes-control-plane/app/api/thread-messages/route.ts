import { requireSession } from "@/lib/auth";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

interface SnapshotMessage { role: string; content: string }

export async function GET(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const threadId = new URL(request.url).searchParams.get("thread_id");
  if (!threadId) return jsonError("thread_id is required");
  const thread = await db().prepare(
    `SELECT id, title, source, context_snapshot AS contextSnapshot, synced_at AS syncedAt
       FROM threads WHERE id = ? AND organization_id = ?`
  ).bind(threadId, session.organizationId).first<{ id: string; title: string; source: string; contextSnapshot: string | null; syncedAt: number | null }>();
  if (!thread) return jsonError("thread not found", 404);
  let snapshot: SnapshotMessage[] = [];
  try { snapshot = thread.contextSnapshot ? JSON.parse(thread.contextSnapshot) as SnapshotMessage[] : []; } catch { snapshot = []; }
  const tasks = await db().prepare(
    `SELECT prompt, result, error, route, status, created_at AS createdAt, completed_at AS completedAt
       FROM tasks WHERE thread_id = ? AND organization_id = ? AND (? IS NULL OR created_at > ?)
       ORDER BY created_at ASC LIMIT 100`
  ).bind(threadId, session.organizationId, thread.syncedAt, thread.syncedAt).all();
  return Response.json({ thread: { id: thread.id, title: thread.title, source: thread.source, syncedAt: thread.syncedAt }, snapshot, tasks: tasks.results });
}
