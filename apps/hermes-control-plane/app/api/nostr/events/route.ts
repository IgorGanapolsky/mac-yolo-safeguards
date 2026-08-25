/**
 * POST /api/nostr/events — Buzz/Nostr path ingress.
 *
 * Accepts a signed NIP-01 event, verifies Schnorr, maps to ACP → Hermes task.
 * Optional enqueue=true creates a task row (same admission rules as POST /api/tasks).
 *
 * Auth: session required (org-scoped). Relays should not post here anonymously.
 */

import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  evaluateTaskAdmission,
  governanceAuditMetadata,
  governanceError,
} from "@/lib/agent-governance";
import { evaluateCloudPromptToolPolicy } from "@/lib/cloud-tool-policy";
import { admitHostedInfoqCascade } from "@/lib/hosted-infoq-cascade";
import { ingressNostrEvent } from "@/lib/nostr-ingress";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";
import { decideTaskRoute, parseRoutePreference } from "@/lib/task-routing";

interface DeviceRoute {
  id: string;
  failoverMode: "disabled" | "manual" | "auto";
  lastSeenAt: number | null;
}

type IngressBody = {
  event?: unknown;
  enqueue?: boolean;
  threadId?: string;
  deviceId?: string;
  routePreference?: string;
  idempotencyKey?: string;
};

export async function POST(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return jsonError("sign in required", 401);
  }

  const body = (await request.json().catch(() => null)) as IngressBody | null;
  if (!body || typeof body !== "object") {
    return jsonError("JSON body required", 400);
  }

  const pipeline = ingressNostrEvent(body.event);
  if (!pipeline.ok) {
    return jsonError(pipeline.error, pipeline.status);
  }

  const { task, event, acp } = pipeline;
  const responseBase = {
    verified: true as const,
    eventId: event.id,
    pubkey: event.pubkey,
    targetAgent: task.targetAgent,
    sourceProtocol: task.sourceProtocol,
    prompt: task.prompt,
    acp: {
      protocolVersion: acp.protocolVersion,
      senderId: acp.sender.id,
    },
    taskInstruction: task,
  };

  // Preview-only: verify + map without enqueue (default for dry-run / Buzz webhooks testing).
  if (body.enqueue !== true) {
    return Response.json({
      ...responseBase,
      enqueued: false,
    });
  }

  // --- enqueue path mirrors POST /api/tasks admission ---
  const org = await db()
    .prepare("SELECT plan, trial_ends_at AS trialEndsAt FROM organizations WHERE id = ?")
    .bind(session.organizationId)
    .first<{ plan: string; trialEndsAt: number | null }>();
  if (!org || org.plan === "suspended") {
    const decision = evaluateTaskAdmission({
      organization: org ?? { plan: "suspended", trialEndsAt: null },
      route: "blocked",
      usage: {},
    });
    return governanceError(decision);
  }

  const rateLimitResult = checkRateLimit(`org:${session.organizationId}`, org.plan);
  if (!rateLimitResult.allowed) {
    return Response.json(
      { error: "rate limit exceeded", reason: rateLimitResult.reason || "exceeded" },
      { status: 429, headers: rateLimitResult.headers },
    );
  }

  const preference = parseRoutePreference(body.routePreference);
  const prompt = task.prompt.trim().slice(0, 24_000);
  if (!prompt) return jsonError("event content empty", 400);

  const device = body.deviceId
    ? await db()
        .prepare(
          `SELECT id, failover_mode AS failoverMode, last_seen_at AS lastSeenAt FROM devices
            WHERE id = ? AND organization_id = ? AND revoked_at IS NULL`,
        )
        .bind(body.deviceId, session.organizationId)
        .first<DeviceRoute>()
    : await db()
        .prepare(
          `SELECT id, failover_mode AS failoverMode, last_seen_at AS lastSeenAt FROM devices
            WHERE organization_id = ? AND revoked_at IS NULL
            ORDER BY last_seen_at DESC NULLS LAST, created_at DESC LIMIT 1`,
        )
        .bind(session.organizationId)
        .first<DeviceRoute>();

  if (!device && preference !== "cloud") {
    return jsonError(
      "Pair a computer first, or set routePreference to cloud (Continuity).",
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
    const cascade = admitHostedInfoqCascade(prompt);
    if (!cascade.allowed) {
      return jsonError(cascade.message, 409);
    }
  }

  const now = Date.now();
  const usage = await db()
    .prepare(
      `SELECT
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS dailyTasks,
         SUM(CASE WHEN status NOT IN ('completed', 'failed') THEN 1 ELSE 0 END) AS activeTasks,
         SUM(CASE WHEN route = 'cloud' AND created_at >= ? THEN 1 ELSE 0 END) AS cloudTasks
       FROM tasks WHERE organization_id = ?`,
    )
    .bind(now - 24 * 60 * 60 * 1000, now - 30 * 24 * 60 * 60 * 1000, session.organizationId)
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
      metadata: governanceAuditMetadata(decision, {
        stage: "admission",
        route,
        source: "nostr",
        eventId: event.id,
      }),
    });
    return governanceError(decision);
  }

  let threadId = body.threadId;
  if (threadId) {
    const owned = await db()
      .prepare("SELECT id FROM threads WHERE id = ? AND organization_id = ? AND deleted_at IS NULL")
      .bind(threadId, session.organizationId)
      .first();
    if (!owned) return jsonError("thread not found", 404);
  } else {
    threadId = crypto.randomUUID();
    const title = `[nostr] ${prompt.replace(/\s+/g, " ").slice(0, 64)}`;
    await db()
      .prepare(
        "INSERT INTO threads (id, organization_id, title, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(threadId, session.organizationId, title, session.userId, now, now)
      .run();
  }

  // Idempotent on event id so Buzz retries do not double-enqueue.
  const idempotencyKey = (body.idempotencyKey || `nostr:${event.id}`).trim().slice(0, 120);
  const taskId = crypto.randomUUID();
  try {
    await db()
      .batch([
        db()
          .prepare(
            `INSERT INTO tasks
              (id, organization_id, thread_id, device_id, prompt, status, route, idempotency_key, lease_generation, created_by_user_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          )
          .bind(
            taskId,
            session.organizationId,
            threadId,
            device?.id ?? null,
            prompt,
            status,
            route,
            idempotencyKey,
            session.userId,
            now,
            now,
          ),
        db()
          .prepare(
            `UPDATE threads SET updated_at = ?,
               source_updated_at = CASE WHEN source_session_id IS NULL THEN source_updated_at
                 ELSE MAX(COALESCE(source_updated_at, 0), ?) END
             WHERE id = ?`,
          )
          .bind(now, now, threadId),
      ]);
  } catch (error) {
    if (String(error).includes("tasks_org_idempotency_unique")) {
      const existing = await db()
        .prepare("SELECT id, status, route, thread_id AS threadId FROM tasks WHERE organization_id = ? AND idempotency_key = ?")
        .bind(session.organizationId, idempotencyKey)
        .first();
      return Response.json({
        ...responseBase,
        enqueued: true,
        duplicate: true,
        task: existing,
      });
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
      source: "nostr",
      eventId: event.id,
      targetAgent: task.targetAgent,
      ...governanceAuditMetadata(decision, { stage: "admission", route }),
    },
  });

  return Response.json({
    ...responseBase,
    enqueued: true,
    task: {
      id: taskId,
      threadId,
      prompt,
      status,
      route,
      preference,
      deviceId: device?.id ?? null,
      createdAt: now,
      traceId: taskId,
    },
  });
}
