import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  evaluateTaskAdmission,
  governanceAuditMetadata,
  governanceError,
} from "@/lib/agent-governance";
import { db } from "@/lib/runtime";
import { evaluateCloudPromptToolPolicy } from "@/lib/cloud-tool-policy";
import { jsonError } from "@/lib/security";
import { decideTaskRoute, parseRoutePreference } from "@/lib/task-routing";

interface DeviceRoute {
  id: string;
  failoverMode: "disabled" | "manual" | "auto";
  lastSeenAt: number | null;
}

export async function GET(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const url = new URL(request.url);
  const threadId = url.searchParams.get("thread_id");
  const whereThread = threadId ? " AND k.thread_id = ?" : "";
  const values = threadId ? [session.organizationId, threadId] : [session.organizationId];
  const rows = await db().prepare(
    `SELECT k.id, k.thread_id AS threadId, COALESCE(t.title_override, t.title) AS threadTitle, k.prompt, k.status, k.route,
            k.result, k.error, k.created_at AS createdAt, k.updated_at AS updatedAt,
            k.completed_at AS completedAt, d.name AS deviceName
       FROM tasks k JOIN threads t ON t.id = k.thread_id
       LEFT JOIN devices d ON d.id = k.device_id
      WHERE k.organization_id = ? AND t.deleted_at IS NULL${whereThread}
      ORDER BY k.created_at DESC LIMIT 100`
  ).bind(...values).all();
  return Response.json({ tasks: rows.results });
}

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const org = await db().prepare(
    "SELECT plan, trial_ends_at AS trialEndsAt, COALESCE(cloud_task_bonus, 0) AS cloudTaskBonus FROM organizations WHERE id = ?",
  ).bind(session.organizationId).first<{ plan: string; trialEndsAt: number | null; cloudTaskBonus: number }>();
  if (!org || org.plan === "suspended") {
    const decision = evaluateTaskAdmission({
      organization: org ?? { plan: "suspended", trialEndsAt: null },
      route: "blocked",
      usage: {},
    });
    await audit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "task.policy.denied",
      targetType: "task-admission",
      metadata: governanceAuditMetadata(decision, { stage: "admission", route: "blocked" }),
    });
    return governanceError(decision);
  }
  const payload = await request.json().catch(() => null) as {
    prompt?: string;
    threadId?: string;
    deviceId?: string;
    idempotencyKey?: string;
    /** local = Mac only; cloud = Continuity always; auto = offline failover (default). */
    routePreference?: string;
  } | null;
  const prompt = payload?.prompt?.trim().slice(0, 24_000);
  if (!prompt) return jsonError("prompt is required");
  const preference = parseRoutePreference(payload?.routePreference);

  const device = payload?.deviceId
    ? await db().prepare(
        `SELECT id, failover_mode AS failoverMode, last_seen_at AS lastSeenAt FROM devices
          WHERE id = ? AND organization_id = ? AND revoked_at IS NULL`
      ).bind(payload.deviceId, session.organizationId).first<DeviceRoute>()
    : await db().prepare(
        `SELECT id, failover_mode AS failoverMode, last_seen_at AS lastSeenAt FROM devices
          WHERE organization_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST, created_at DESC LIMIT 1`
      ).bind(session.organizationId).first<DeviceRoute>();
  // Continuity-only runs still need a paired device id for org/thread ownership.
  if (!device) return jsonError("pair a Hermes machine before starting work", 409);

  const decisionRoute = decideTaskRoute({ preference, device });
  const status = decisionRoute.status;
  const route = decisionRoute.route;

  if (route === "cloud") {
    const toolPolicy = evaluateCloudPromptToolPolicy(prompt);
    if (!toolPolicy.allowed) {
      return jsonError(toolPolicy.message, 409);
    }
  }

  const now = Date.now();
  const usage = await db().prepare(
    `SELECT
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS dailyTasks,
       SUM(CASE WHEN status NOT IN ('completed', 'failed') THEN 1 ELSE 0 END) AS activeTasks,
       SUM(CASE WHEN route = 'cloud' AND created_at >= ? THEN 1 ELSE 0 END) AS cloudTasks
     FROM tasks WHERE organization_id = ?`
  ).bind(now - 24 * 60 * 60 * 1000, now - 30 * 24 * 60 * 60 * 1000, session.organizationId)
    .first<{ dailyTasks: number | null; activeTasks: number | null; cloudTasks: number | null }>();
  const decision = evaluateTaskAdmission({
    organization: org,
    route,
    usage: {
      dailyTasks: usage?.dailyTasks ?? 0,
      activeTasks: usage?.activeTasks ?? 0,
      cloudTasks: usage?.cloudTasks ?? 0,
    },
    cloudTaskBonus: org.cloudTaskBonus,
    now,
  });
  if (!decision.allowed) {
    await audit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "task.policy.denied",
      targetType: "task-admission",
      targetId: payload?.threadId ?? null,
      metadata: governanceAuditMetadata(decision, { stage: "admission", route }),
    });
    return governanceError(decision);
  }

  let threadId = payload?.threadId;
  if (threadId) {
    const owned = await db().prepare("SELECT id FROM threads WHERE id = ? AND organization_id = ? AND deleted_at IS NULL")
      .bind(threadId, session.organizationId).first();
    if (!owned) return jsonError("thread not found", 404);
  } else {
    threadId = crypto.randomUUID();
    const title = prompt.replace(/\s+/g, " ").slice(0, 72);
    const threadCreatedAt = Date.now();
    await db().prepare(
      "INSERT INTO threads (id, organization_id, title, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(threadId, session.organizationId, title, session.userId, threadCreatedAt, threadCreatedAt).run();
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
      db().prepare(
        `UPDATE threads SET updated_at = ?,
           source_updated_at = CASE WHEN source_session_id IS NULL THEN source_updated_at
             ELSE MAX(COALESCE(source_updated_at, 0), ?) END
         WHERE id = ?`
      ).bind(now, now, threadId),
    ]);
  } catch (error) {
    if (String(error).includes("tasks_org_idempotency_unique")) {
      const existing = await db().prepare("SELECT id, status, route FROM tasks WHERE organization_id = ? AND idempotency_key = ?")
        .bind(session.organizationId, idempotencyKey).first();
      return Response.json({ task: existing, duplicate: true }, { status: 200 });
    }
    throw error;
  }
  await audit({
    organizationId: session.organizationId,
    actorType: "user",
    actorId: session.userId,
    action: "task.create",
    targetType: "task",
    targetId: taskId,
    metadata: {
      route,
      status,
      preference,
      deviceId: device.id,
      ...governanceAuditMetadata(decision, { stage: "admission", route }),
    },
  });
  return Response.json({
    task: {
      id: taskId,
      threadId,
      prompt,
      status,
      route,
      preference,
      deviceId: device.id,
      createdAt: now,
    },
  }, { status: 201 });
}
