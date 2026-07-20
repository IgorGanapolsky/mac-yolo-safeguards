import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as { taskId?: string } | null;
  if (!payload?.taskId) return jsonError("taskId is required");
  const update = await db().prepare(
    `UPDATE tasks SET status = 'cloud_pending', route = 'cloud', updated_at = ?
      WHERE id = ? AND organization_id = ? AND status IN ('needs_failover', 'offline_blocked') AND lease_owner IS NULL`
  ).bind(Date.now(), payload.taskId, session.organizationId).run();
  if (update.meta.changes !== 1) return jsonError("task is not eligible for cloud failover", 409);
  await audit({ organizationId: session.organizationId, actorType: "user", actorId: session.userId, action: "task.failover.approve", targetType: "task", targetId: payload.taskId });
  return Response.json({ ok: true, status: "cloud_pending", route: "cloud" });
}
