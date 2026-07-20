import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

interface DeviceRoute {
  id: string;
  failoverMode: "disabled" | "manual" | "auto";
  lastSeenAt: number | null;
}

const MAX_ACTIVE_TASKS = 10;
const MAX_DAILY_TASKS = 250;
const TRIAL_CLOUD_TASKS = 5;
const PRO_CLOUD_TASKS_PER_30_DAYS = 100;

export async function GET(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const url = new URL(request.url);
  const threadId = url.searchParams.get("thread_id");
  const whereThread = threadId ? " AND k.thread_id = ?" : "";
  const values = threadId ? [session.organizationId, threadId] : [session.organizationId];
  const rows = await db().prepare(
    `SELECT k.id, k.thread_id AS threadId, t.title AS threadTitle, k.prompt, k.status, k.route,
            k.result, k.error, k.created_at AS createdAt, k.updated_at AS updatedAt,
            k.completed_at AS completedAt, d.name AS deviceName
       FROM tasks k JOIN threads t ON t.id = k.thread_id
       LEFT JOIN devices d ON d.id = k.device_id
      WHERE k.organization_id = ?${whereThread}
      ORDER BY k.created_at DESC LIMIT 100`
  ).bind(...values).all();
  return Response.json({ tasks: rows.results });
}

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const org = await db().prepare("SELECT plan, trial_ends_at AS trialEndsAt FROM organizations WHERE id = ?")
    .bind(session.organizationId).first<{ plan: string; trialEndsAt: number | null }>();
  if (!org || org.plan === "suspended" || (org.plan === "trial" && (org.trialEndsAt ?? 0) < Date.now())) {
    return jsonError("an active subscription is required to start new work", 402);
  }
  const payload = await request.json().catch(() => null) as {
    prompt?: string; threadId?: string; deviceId?: string; idempotencyKey?: string;
  } | null;
  const prompt = payload?.prompt?.trim().slice(0, 24_000);
  if (!prompt) return jsonError("prompt is required");

  let threadId = payload?.threadId;
  if (threadId) {
    const owned = await db().prepare("SELECT id FROM threads WHERE id = ? AND organization_id = ?")
      .bind(threadId, session.organizationId).first();
    if (!owned) return jsonError("thread not found", 404);
  } else {
    threadId = crypto.randomUUID();
    const title = prompt.replace(/\s+/g, " ").slice(0, 72);
    const now = Date.now();
    await db().prepare(
      "INSERT INTO threads (id, organization_id, title, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(threadId, session.organizationId, title, session.userId, now, now).run();
  }

  const device = payload?.deviceId
    ? await db().prepare(
        `SELECT id, failover_mode AS failoverMode, last_seen_at AS lastSeenAt FROM devices
          WHERE id = ? AND organization_id = ? AND revoked_at IS NULL`
      ).bind(payload.deviceId, session.organizationId).first<DeviceRoute>()
    : await db().prepare(
        `SELECT id, failover_mode AS failoverMode, last_seen_at AS lastSeenAt FROM devices
          WHERE organization_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST, created_at DESC LIMIT 1`
      ).bind(session.organizationId).first<DeviceRoute>();
  if (!device) return jsonError("pair a Hermes machine before starting work", 409);

  const online = Boolean(device.lastSeenAt && Date.now() - device.lastSeenAt < 60_000);
  let status: string;
  let route: "local" | "cloud" | "blocked";
  if (online) { status = "local_pending"; route = "local"; }
  else if (device.failoverMode === "auto") { status = "cloud_pending"; route = "cloud"; }
  else if (device.failoverMode === "manual") { status = "needs_failover"; route = "blocked"; }
  else { status = "offline_blocked"; route = "blocked"; }

  const now = Date.now();
  const usage = await db().prepare(
    `SELECT
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS dailyTasks,
       SUM(CASE WHEN status NOT IN ('completed', 'failed') THEN 1 ELSE 0 END) AS activeTasks,
       SUM(CASE WHEN route = 'cloud' AND created_at >= ? THEN 1 ELSE 0 END) AS cloudTasks
     FROM tasks WHERE organization_id = ?`
  ).bind(now - 24 * 60 * 60 * 1000, now - 30 * 24 * 60 * 60 * 1000, session.organizationId)
    .first<{ dailyTasks: number | null; activeTasks: number | null; cloudTasks: number | null }>();
  if ((usage?.activeTasks ?? 0) >= MAX_ACTIVE_TASKS) return jsonError("finish an active task before starting another", 429);
  if ((usage?.dailyTasks ?? 0) >= MAX_DAILY_TASKS) return jsonError("daily task safety limit reached", 429);
  const cloudLimit = org.plan === "trial" ? TRIAL_CLOUD_TASKS : PRO_CLOUD_TASKS_PER_30_DAYS;
  if (route === "cloud" && (usage?.cloudTasks ?? 0) >= cloudLimit) {
    return jsonError(org.plan === "trial" ? "trial cloud continuation limit reached" : "monthly cloud continuation limit reached", 429);
  }

  const taskId = crypto.randomUUID();
  const idempotencyKey = payload?.idempotencyKey?.trim().slice(0, 120) || crypto.randomUUID();
  try {
    await db().batch([
      db().prepare(
        `INSERT INTO tasks
          (id, organization_id, thread_id, device_id, prompt, status, route, idempotency_key, lease_generation, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).bind(taskId, session.organizationId, threadId, device.id, prompt, status, route, idempotencyKey, session.userId, now, now),
      db().prepare("UPDATE threads SET updated_at = ? WHERE id = ?").bind(now, threadId),
    ]);
  } catch (error) {
    if (String(error).includes("tasks_org_idempotency_unique")) {
      const existing = await db().prepare("SELECT id, status, route FROM tasks WHERE organization_id = ? AND idempotency_key = ?")
        .bind(session.organizationId, idempotencyKey).first();
      return Response.json({ task: existing, duplicate: true }, { status: 200 });
    }
    throw error;
  }
  await audit({ organizationId: session.organizationId, actorType: "user", actorId: session.userId, action: "task.create", targetType: "task", targetId: taskId, metadata: { route, status, deviceId: device.id } });
  return Response.json({ task: { id: taskId, threadId, prompt, status, route, deviceId: device.id, createdAt: now } }, { status: 201 });
}
