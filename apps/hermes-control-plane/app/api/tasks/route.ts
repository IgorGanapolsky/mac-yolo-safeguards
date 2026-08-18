import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  evaluateTaskAdmission,
  governanceAuditMetadata,
  governanceError,
} from "@/lib/agent-governance";
import { db } from "@/lib/runtime";
import { evaluateCloudPromptToolPolicy, requiredHostedSidecars } from "@/lib/cloud-tool-policy";
import {
  admitCloudSend,
  lastCachedModelError,
  MODEL_ERROR_LOOKBACK_MS,
  probeBrowserHealth,
  probeRunnerHealth,
  waitForHostedReady,
} from "@/lib/hosted-apphost";
import { jsonError } from "@/lib/security";
import { decideTaskRoute, parseRoutePreference } from "@/lib/task-routing";
// A+ imports: runtime schema validation + rate limiting
import { validateRoute, RouteSchemas } from "@/lib/schema-validator";
import { checkRateLimit } from "@/lib/rate-limit";

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
  const org = await db().prepare("SELECT plan, trial_ends_at AS trialEndsAt FROM organizations WHERE id = ?")
    .bind(session.organizationId).first<{ plan: string; trialEndsAt: number | null }>();
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
  const rawPayload = await request.json().catch(() => null);
  // A+ Structured Outputs: validate payload before processing
  const validation = validateRoute<{ prompt: string }>(RouteSchemas.createTask, rawPayload);
  if (!validation.ok) {
    return jsonError(`invalid request: ${validation.errors.join('; ')}`, 400);
  }
  const payload = validation.value as {
    prompt: string;
    threadId?: string;
    deviceId?: string;
    idempotencyKey?: string;
    traceId?: string;
    routePreference?: string;
  };
  // A+ Multi-tenancy: enforce per-organization rate limit before task creation
  const rateLimitResult = checkRateLimit(`org:${session.organizationId}`, org.plan);
  if (!rateLimitResult.allowed) {
    return Response.json(
      {
        error: "rate limit exceeded",
        reason: rateLimitResult.reason || 'exceeded',
      },
      {
        status: 429,
        headers: rateLimitResult.headers,
      },
    );
  }
  const prompt = payload.prompt.trim().slice(0, 24_000);
  if (!prompt) return jsonError("prompt is required");
  const preference = parseRoutePreference(payload.routePreference);

  const device = payload.deviceId
    ? await db().prepare(
        `SELECT id, failover_mode AS failoverMode, last_seen_at AS lastSeenAt FROM devices
          WHERE id = ? AND organization_id = ? AND revoked_at IS NULL`
      ).bind(payload.deviceId, session.organizationId).first<DeviceRoute>()
    : await db().prepare(
        `SELECT id, failover_mode AS failoverMode, last_seen_at AS lastSeenAt FROM devices
          WHERE organization_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST, created_at DESC LIMIT 1`
      ).bind(session.organizationId).first<DeviceRoute>();

  // Continuity (cloud) does not require a paired local computer. Local/auto still do.
  if (!device && preference !== "cloud") {
    return jsonError(
      "Hosted VPS is required for this workspace. Start a trial or Pro on ThumbGate.app.",
      409,
    );
  }

  const decisionRoute = decideTaskRoute({ preference, device: device ?? null });
  const status = decisionRoute.status;
  const route = decisionRoute.route;

  if (route === "cloud") {
    const toolPolicy = evaluateCloudPromptToolPolicy(prompt);
    if (!toolPolicy.allowed) {
      return jsonError(toolPolicy.message, 409);
    }
    const required = requiredHostedSidecars(prompt);
    const probeNow = Date.now();
    const runner = await probeRunnerHealth({ now: probeNow, timeoutMs: 8_000, force: true });
    const browser = required.includes("browser")
      ? await probeBrowserHealth({ now: probeNow, timeoutMs: 8_000, force: true })
      : null;
    let modelError = lastCachedModelError();
    try {
      const lastFailed = await db().prepare(
        `SELECT error FROM tasks
          WHERE organization_id = ? AND route = 'cloud' AND status = 'failed'
            AND error IS NOT NULL AND updated_at >= ?
          ORDER BY updated_at DESC LIMIT 1`,
      ).bind(session.organizationId, probeNow - MODEL_ERROR_LOOKBACK_MS).first<{ error: string | null }>();
      if (lastFailed?.error) modelError = lastFailed.error;
    } catch {
      // D1 miss: fail-closed on runner; model uses isolate cache if present.
    }
    const hostedReady = waitForHostedReady({
      runner: { ok: runner.ok, lastPollAt: runner.lastPollAt ?? null },
      modelError,
      browser: browser ? { ok: browser.ok, lastPollAt: browser.lastPollAt ?? null } : null,
      required,
      now: probeNow,
    });
    const hostedAdmit = admitCloudSend(hostedReady);
    if (!hostedAdmit.allowed) {
      return jsonError(hostedAdmit.message, 409);
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
    now,
  });
  if (!decision.allowed) {
    await audit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "task.policy.denied",
      targetType: "task-admission",
      targetId: payload.threadId ?? null,
      metadata: governanceAuditMetadata(decision, { stage: "admission", route }),
    });
    return governanceError(decision);
  }

  let threadId = payload.threadId;
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
  /** Client may supply a correlation id; default to task id for end-to-end traces. */
  const traceId =
    typeof payload.traceId === "string" && payload.traceId.trim()
      ? payload.traceId.trim().slice(0, 64)
      : taskId;
  const idempotencyKey = payload.idempotencyKey?.trim().slice(0, 120) || crypto.randomUUID();
  try {
    await db().batch([
      db().prepare(
        `INSERT INTO tasks
          (id, organization_id, thread_id, device_id, prompt, status, route, idempotency_key, lease_generation, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).bind(taskId, session.organizationId, threadId, device?.id ?? null, prompt, status, route, idempotencyKey, session.userId, now, now),
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
        .bind(session.organizationId, idempotencyKey).first() as { id?: string; status?: string; route?: string } | null;
      return Response.json({
        task: existing ? { ...existing, traceId: existing.id ?? traceId } : existing,
        duplicate: true,
        traceId: existing?.id ?? traceId,
      }, { status: 200 });
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
      deviceId: device?.id ?? null,
      traceId,
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
      deviceId: device?.id ?? null,
      createdAt: now,
      traceId,
    },
    traceId,
  }, {
    status: 201,
    headers: { "x-thumbgate-trace-id": traceId },
  });
}
