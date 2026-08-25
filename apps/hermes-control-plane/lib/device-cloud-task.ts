import { audit } from "./audit";
import {
  evaluateTaskAdmission,
  governanceAuditMetadata,
  governanceError,
} from "./agent-governance";
import type { DeviceIdentity } from "./device-auth";
import { ackHostedSend, publicRunReceipt } from "./hosted-source-of-truth";
import { admitHostedTaskDescription } from "./hosted-academy-4d";
import { admitHostedContext } from "./hosted-edit-anchor";
import { db } from "./runtime";
import { evaluateCloudPromptToolPolicy } from "./cloud-tool-policy";
import { admitHostedInfoqCascade } from "./hosted-infoq-cascade";
import { decideTaskRoute, parseRoutePreference } from "./task-routing";

export type ContextMessage = { role: "user" | "assistant" | "system"; content: string };

const MAX_CONTEXT_MESSAGES = 60;
const MAX_CONTEXT_CHARS = 48_000;

function cleanText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.replaceAll("\u0000", "").trim().slice(0, limit) : "";
}

function boundContextMessages(messages: unknown): ContextMessage[] {
  if (!Array.isArray(messages)) return [];
  const cleaned = messages.slice(-MAX_CONTEXT_MESSAGES).flatMap((message) => {
    const row = message as { role?: string; content?: string };
    const role = row.role === "user" || row.role === "assistant" || row.role === "system" ? row.role : null;
    const content = cleanText(row.content, 8_000);
    return role && content ? [{ role, content }] : [];
  });
  let total = 0;
  const bounded: ContextMessage[] = [];
  for (const message of cleaned.reverse()) {
    if (total + message.content.length > MAX_CONTEXT_CHARS) break;
    bounded.unshift(message);
    total += message.content.length;
  }
  return bounded;
}

export type SubmitDeviceCloudTaskInput = {
  identity: DeviceIdentity;
  prompt: string;
  threadId?: string;
  routePreference?: string;
  contextMessages?: unknown;
  idempotencyKey?: string;
  traceId?: string;
  source?: string;
  kind?: string;
  done?: string;
  acceptance?: Array<{ criterion?: string; proofSurface?: string; proof?: string }>;
};

export type DeviceCloudTaskRow = {
  id: string;
  threadId: string;
  status: string;
  route: string;
  prompt: string;
  result?: string | null;
  error?: string | null;
};

export async function submitDeviceCloudTask(
  input: SubmitDeviceCloudTaskInput,
): Promise<Response | { task: DeviceCloudTaskRow; traceId: string; receipt: ReturnType<typeof publicRunReceipt> }> {
  const org = await db().prepare("SELECT plan, trial_ends_at AS trialEndsAt FROM organizations WHERE id = ?")
    .bind(input.identity.organizationId).first<{ plan: string; trialEndsAt: number | null }>();
  if (!org || org.plan === "suspended") {
    const decision = evaluateTaskAdmission({
      organization: org ?? { plan: "suspended", trialEndsAt: null },
      route: "blocked",
      usage: {},
    });
    await audit({
      organizationId: input.identity.organizationId,
      actorType: "device",
      actorId: input.identity.id,
      action: "task.policy.denied",
      targetType: "task-admission",
      metadata: governanceAuditMetadata(decision, { stage: "admission", route: "blocked", source: input.source ?? null }),
    });
    return governanceError(decision);
  }

  const promptRaw = input.prompt.trim();
  if (!promptRaw) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  const contextAdmit = admitHostedContext({
    bytes: new TextEncoder().encode(promptRaw).length,
  });
  if (!contextAdmit.ok) {
    return Response.json({ error: contextAdmit.message }, { status: 409 });
  }
  const prompt = promptRaw.slice(0, 24_000);
  const preference = parseRoutePreference(input.routePreference ?? "cloud");
  const device = {
    failoverMode: input.identity.failoverMode,
    lastSeenAt: Date.now(),
  };
  const decisionRoute = decideTaskRoute({ preference, device });
  const status = decisionRoute.status;
  const route = decisionRoute.route;

  const descriptionAdmit = admitHostedTaskDescription({
    kind: input.kind,
    done: input.done,
    acceptance: input.acceptance,
  });
  if (!descriptionAdmit.ok) {
    return Response.json({ error: descriptionAdmit.message }, { status: 409 });
  }

  if (route === "cloud") {
    const toolPolicy = evaluateCloudPromptToolPolicy(prompt);
    if (!toolPolicy.allowed) {
      return Response.json({ error: toolPolicy.message }, { status: 409 });
    }
    const cascade = admitHostedInfoqCascade(prompt);
    if (!cascade.allowed) {
      return Response.json({ error: cascade.message }, { status: 409 });
    }
  }

  const now = Date.now();
  const usage = await db().prepare(
    `SELECT
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS dailyTasks,
       SUM(CASE WHEN status NOT IN ('completed', 'failed') THEN 1 ELSE 0 END) AS activeTasks,
       SUM(CASE WHEN route = 'cloud' AND created_at >= ? THEN 1 ELSE 0 END) AS cloudTasks
     FROM tasks WHERE organization_id = ?`
  ).bind(now - 24 * 60 * 60 * 1000, now - 30 * 24 * 60 * 60 * 1000, input.identity.organizationId)
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
      organizationId: input.identity.organizationId,
      actorType: "device",
      actorId: input.identity.id,
      action: "task.policy.denied",
      targetType: "task-admission",
      targetId: input.threadId ?? null,
      metadata: governanceAuditMetadata(decision, { stage: "admission", route, source: input.source ?? null }),
    });
    return governanceError(decision);
  }

  const owner = await db().prepare(
    `SELECT user_id AS userId FROM memberships
      WHERE organization_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at ASC LIMIT 1`
  ).bind(input.identity.organizationId).first<{ userId: string }>();
  if (!owner) {
    return Response.json({ error: "device organization has no owner" }, { status: 409 });
  }

  const contextMessages = boundContextMessages(input.contextMessages);
  const contextSnapshot = contextMessages.length ? JSON.stringify(contextMessages) : null;

  let threadId = input.threadId;
  if (threadId) {
    const owned = await db().prepare(
      "SELECT id FROM threads WHERE id = ? AND organization_id = ? AND deleted_at IS NULL"
    ).bind(threadId, input.identity.organizationId).first();
    if (!owned) {
      return Response.json({ error: "thread not found" }, { status: 404 });
    }
    if (contextSnapshot) {
      await db().prepare(
        "UPDATE threads SET context_snapshot = ?, synced_at = ?, updated_at = ? WHERE id = ?"
      ).bind(contextSnapshot, now, now, threadId).run();
    }
  } else {
    threadId = crypto.randomUUID();
    const title = prompt.replace(/\s+/g, " ").slice(0, 72);
    await db().prepare(
      `INSERT INTO threads
        (id, organization_id, title, device_id, source, preview, message_count, context_snapshot, synced_at,
         created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      threadId,
      input.identity.organizationId,
      title,
      input.identity.id,
      input.source?.slice(0, 40) || "hermes-mobile-continuity",
      prompt.slice(0, 500),
      contextMessages.length,
      contextSnapshot,
      contextSnapshot ? now : null,
      owner.userId,
      now,
      now,
    ).run();
  }

  const taskId = crypto.randomUUID();
  const traceId =
    typeof input.traceId === "string" && input.traceId.trim()
      ? input.traceId.trim().slice(0, 64)
      : taskId;
  const idempotencyKey = input.idempotencyKey?.trim().slice(0, 120) || crypto.randomUUID();

  try {
    await db().batch([
      db().prepare(
        `INSERT INTO tasks
          (id, organization_id, thread_id, device_id, prompt, status, route, idempotency_key, lease_generation,
           created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).bind(
        taskId,
        input.identity.organizationId,
        threadId,
        input.identity.id,
        prompt,
        status,
        route,
        idempotencyKey,
        owner.userId,
        now,
        now,
      ),
      db().prepare(
        `UPDATE threads SET updated_at = ?,
           source_updated_at = CASE WHEN source_session_id IS NULL THEN source_updated_at
             ELSE MAX(COALESCE(source_updated_at, 0), ?) END
         WHERE id = ?`
      ).bind(now, now, threadId),
    ]);
  } catch (error) {
    if (String(error).includes("tasks_org_idempotency_unique")) {
      const existing = await db().prepare(
        "SELECT id, thread_id AS threadId, status, route, prompt, result, error FROM tasks WHERE organization_id = ? AND idempotency_key = ?"
      ).bind(input.identity.organizationId, idempotencyKey).first<DeviceCloudTaskRow>();
      if (existing) {
        return {
          task: existing,
          traceId: existing.id,
          receipt: publicRunReceipt({ taskId: existing.id, route: existing.route, status: existing.status }),
        };
      }
    }
    throw error;
  }

  await audit({
    organizationId: input.identity.organizationId,
    actorType: "device",
    actorId: input.identity.id,
    action: "task.create",
    targetType: "task",
    targetId: taskId,
    metadata: {
      route,
      status,
      preference,
      traceId,
      source: input.source ?? null,
      ...governanceAuditMetadata(decision, { stage: "admission", route }),
    },
  });

  if (route === "cloud") {
    const ack = ackHostedSend({
      runtime: "vps",
      persistedId: taskId,
      admitted: true,
    });
    if (!ack.ok) {
      return Response.json({ error: ack.message }, { status: 409 });
    }
  }

  const receipt = publicRunReceipt({ taskId, route, status });
  return {
    task: {
      id: taskId,
      threadId,
      status,
      route,
      prompt,
    },
    traceId,
    receipt,
  };
}

export async function fetchDeviceCloudTaskStatus(
  identity: DeviceIdentity,
  taskId: string,
): Promise<DeviceCloudTaskRow | null> {
  return db().prepare(
    `SELECT id, thread_id AS threadId, status, route, prompt, result, error
       FROM tasks
      WHERE id = ? AND organization_id = ?`
  ).bind(taskId, identity.organizationId).first<DeviceCloudTaskRow>();
}
