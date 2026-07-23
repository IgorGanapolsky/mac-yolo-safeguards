import { audit } from "./audit";
import {
  AGENT_GOVERNANCE_POLICY_VERSION,
  evaluateCloudContinuation,
  governanceAuditMetadata,
  type GovernanceDecision,
} from "./agent-governance";
import { db } from "./runtime";
import { randomToken, sha256 } from "./security";
import { webSessionIdForThread } from "./web-session";

export const TASK_LEASE_MS = 90_000;

interface TaskCandidate {
  id: string;
  organizationId: string;
  threadId: string;
  threadTitle: string;
  prompt: string;
  currentRoute: "local" | "cloud" | "blocked";
  leaseGeneration: number;
  sourceSessionId: string | null;
  contextSnapshot: string | null;
  syncedAt: number | null;
  createdAt: number;
  plan: string;
  trialEndsAt: number | null;
  cloudTasks: number;
}

interface ContextMessage { role: "user" | "assistant" | "system"; content: string }

function parseSnapshot(value: string | null): ContextMessage[] {
  try {
    const parsed = value ? JSON.parse(value) as ContextMessage[] : [];
    return parsed.filter((message) => ["user", "assistant", "system"].includes(message.role) && typeof message.content === "string" && message.content.trim());
  } catch { return []; }
}

function boundMessages(messages: ContextMessage[], maxChars = 64_000): ContextMessage[] {
  let chars = 0;
  const result: ContextMessage[] = [];
  for (const message of [...messages].reverse()) {
    if (chars + message.content.length > maxChars) break;
    result.unshift(message);
    chars += message.content.length;
  }
  return result;
}

export async function claimTask(input: {
  route: "local" | "cloud";
  owner: string;
  deviceId?: string;
}): Promise<{ task: {
  id: string;
  organizationId: string;
  threadId: string;
  threadTitle: string;
  prompt: string;
  leaseGeneration: number;
  sourceSessionId: string | null;
  contextMessages: ContextMessage[];
  handoffMessages: ContextMessage[];
  leaseToken: string;
  leaseExpiresAt: number;
} } | null> {
  const now = Date.now();
  const routeClause = input.route === "local"
    ? "k.route = 'local' AND k.device_id = ? AND k.status IN ('local_pending', 'cloud_pending', 'running')"
    : `((k.route = 'cloud' AND k.status IN ('cloud_pending', 'running'))
        OR (k.route = 'local' AND k.status = 'local_pending' AND d.failover_mode = 'auto'
            AND (d.last_seen_at IS NULL OR d.last_seen_at < ?))
        OR (k.route = 'local' AND k.status = 'running' AND d.failover_mode = 'auto'
            AND (d.last_seen_at IS NULL OR d.last_seen_at < ?)))`;
  // The 'running' branch above is what lets cloud take over a task the Mac claimed and then
  // went offline mid-execution (lid closed while running) — not just tasks never claimed locally.
  // Both branches require the task's own lease to already be expired (enforced by the trailing
  // lease_expires_at check below), so the fencing-token CAS in the UPDATE still owns correctness.
  const params = input.route === "local" ? [input.deviceId!, now] : [now - 60_000, now - 60_000, now];
  const candidate = await db().prepare(
    `SELECT k.id, k.organization_id AS organizationId, k.thread_id AS threadId, t.title AS threadTitle, k.prompt,
            k.route AS currentRoute, k.lease_generation AS leaseGeneration, k.created_at AS createdAt,
            t.source_session_id AS sourceSessionId, t.context_snapshot AS contextSnapshot, t.synced_at AS syncedAt,
            o.plan, o.trial_ends_at AS trialEndsAt,
            (SELECT COUNT(*) FROM tasks AS cloud_usage
              WHERE cloud_usage.organization_id = k.organization_id AND cloud_usage.route = 'cloud'
                AND cloud_usage.created_at >= ?) AS cloudTasks
       FROM tasks k JOIN threads t ON t.id = k.thread_id
       JOIN organizations o ON o.id = k.organization_id
       LEFT JOIN devices d ON d.id = k.device_id
      WHERE ${routeClause}
        AND (k.lease_expires_at IS NULL OR k.lease_expires_at <= ?)
      ORDER BY k.created_at ASC LIMIT 1`
  ).bind(now - 30 * 24 * 60 * 60 * 1000, ...params).first<TaskCandidate>();
  if (!candidate) return null;

  let cloudDecision: GovernanceDecision | null = null;
  if (input.route === "cloud") {
    cloudDecision = evaluateCloudContinuation({
      organization: { plan: candidate.plan, trialEndsAt: candidate.trialEndsAt },
      cloudTasks: candidate.cloudTasks,
      cloudTaskDelta: candidate.currentRoute === "cloud" ? 0 : 1,
      now,
    });
    if (!cloudDecision.allowed) {
      const blocked = await db().prepare(
        `UPDATE tasks SET status = 'offline_blocked', route = 'blocked', error = ?, updated_at = ?,
                lease_owner = NULL, lease_token_hash = NULL, lease_expires_at = NULL
          WHERE id = ? AND lease_generation = ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`
      ).bind(`Governance policy denied cloud execution: ${cloudDecision.message}`,
        now, candidate.id, candidate.leaseGeneration, now).run();
      if (blocked.meta.changes === 1) {
        await audit({
          organizationId: candidate.organizationId,
          actorType: "runner",
          actorId: input.owner,
          action: "task.policy.denied",
          targetType: "task",
          targetId: candidate.id,
          metadata: governanceAuditMetadata(cloudDecision, { stage: "automatic_claim", route: "cloud" }),
        });
      }
      return null;
    }
  }

  let sourceSessionId = candidate.sourceSessionId;
  if (input.route === "local" && !sourceSessionId) {
    sourceSessionId = webSessionIdForThread(candidate.threadId);
    const binding = await db().prepare(
      `UPDATE threads SET device_id = ?, source_session_id = ?, source = 'thumbgate-web'
        WHERE id = ? AND organization_id = ? AND source_session_id IS NULL`
    ).bind(input.deviceId!, sourceSessionId, candidate.threadId, candidate.organizationId).run();
    if (binding.meta.changes !== 1) {
      const current = await db().prepare(
        "SELECT source_session_id AS sourceSessionId FROM threads WHERE id = ? AND organization_id = ?"
      ).bind(candidate.threadId, candidate.organizationId).first<{ sourceSessionId: string | null }>();
      if (!current?.sourceSessionId) throw new Error("Failed to persist the Hermes session binding");
      sourceSessionId = current.sourceSessionId;
    }
  }

  const prior = await db().prepare(
    `SELECT prompt, result, created_at AS createdAt FROM tasks
      WHERE thread_id = ? AND id <> ? AND status = 'completed' AND result IS NOT NULL AND created_at < ?
      ORDER BY created_at ASC LIMIT 30`
  ).bind(candidate.threadId, candidate.id, candidate.createdAt).all<{ prompt: string; result: string; createdAt: number }>();
  const unsynced = prior.results.filter((task) => task.createdAt > (candidate.syncedAt ?? 0));
  const handoffMessages = unsynced.flatMap((task) => [
    { role: "user" as const, content: task.prompt },
    { role: "assistant" as const, content: task.result },
  ]);
  const contextMessages = boundMessages([...parseSnapshot(candidate.contextSnapshot), ...handoffMessages]);

  const leaseToken = randomToken();
  const leaseExpiresAt = now + TASK_LEASE_MS;
  const update = await db().prepare(
    `UPDATE tasks SET status = 'running', route = ?, lease_owner = ?, lease_token_hash = ?,
            lease_generation = lease_generation + 1, lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND lease_generation = ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        AND (? <> 'cloud' OR route = 'cloud' OR
          (SELECT COUNT(*) FROM tasks AS cloud_budget
            WHERE cloud_budget.organization_id = ? AND cloud_budget.route = 'cloud'
              AND cloud_budget.created_at >= ?) < ?)`
  ).bind(input.route, input.owner, await sha256(leaseToken), leaseExpiresAt, now,
    candidate.id, candidate.leaseGeneration, now, input.route, candidate.organizationId,
    now - 30 * 24 * 60 * 60 * 1000, cloudDecision?.limit ?? 0).run();
  if (update.meta.changes !== 1) return null;
  await audit({
    organizationId: candidate.organizationId,
    actorType: input.route === "local" ? "device" : "runner",
    actorId: input.owner,
    action: "task.claim",
    targetType: "task",
    targetId: candidate.id,
    metadata: {
      route: input.route,
      generation: candidate.leaseGeneration + 1,
      ...(cloudDecision
        ? governanceAuditMetadata(cloudDecision, { stage: "automatic_claim", route: "cloud" })
        : { policyVersion: AGENT_GOVERNANCE_POLICY_VERSION, decision: "allow", stage: "automatic_claim" }),
    },
  });
  return { task: {
    id: candidate.id,
    organizationId: candidate.organizationId,
    threadId: candidate.threadId,
    threadTitle: candidate.threadTitle,
    prompt: candidate.prompt,
    sourceSessionId,
    contextMessages,
    handoffMessages: boundMessages(handoffMessages, 24_000),
    leaseGeneration: candidate.leaseGeneration + 1,
    leaseToken,
    leaseExpiresAt,
  } };
}

export async function renewTask(input: {
  owner: string;
  taskId: string;
  leaseToken: string;
  actorType: "device" | "runner";
}): Promise<{ leaseExpiresAt: number } | null> {
  const now = Date.now();
  const leaseExpiresAt = now + TASK_LEASE_MS;
  const tokenHash = await sha256(input.leaseToken);
  const existing = await db().prepare(
    `SELECT organization_id AS organizationId, route, lease_generation AS leaseGeneration
       FROM tasks WHERE id = ?`
  ).bind(input.taskId).first<{
    organizationId: string;
    route: "local" | "cloud";
    leaseGeneration: number;
  }>();
  if (!existing) return null;
  const update = await db().prepare(
    `UPDATE tasks SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = 'running' AND lease_owner = ? AND lease_token_hash = ?
        AND lease_expires_at > ?`
  ).bind(leaseExpiresAt, now, input.taskId, input.owner, tokenHash, now).run();
  if (update.meta.changes !== 1) return null;
  await audit({
    organizationId: existing.organizationId,
    actorType: input.actorType,
    actorId: input.owner,
    action: "task.lease.renew",
    targetType: "task",
    targetId: input.taskId,
    metadata: { route: existing.route, generation: existing.leaseGeneration, leaseExpiresAt },
  });
  return { leaseExpiresAt };
}

export async function completeTask(input: {
  owner: string;
  taskId: string;
  leaseToken: string;
  result?: string;
  error?: string;
  actorType: "device" | "runner";
}): Promise<boolean> {
  const now = Date.now();
  const status = input.error ? "failed" : "completed";
  const tokenHash = await sha256(input.leaseToken);
  const existing = await db().prepare(
    `SELECT organization_id AS organizationId, route, lease_generation AS leaseGeneration,
            created_at AS createdAt FROM tasks WHERE id = ?`
  ).bind(input.taskId).first<{
    organizationId: string;
    route: "local" | "cloud";
    leaseGeneration: number;
    createdAt: number;
  }>();
  if (!existing) return false;
  const update = await db().prepare(
    `UPDATE tasks SET status = ?, result = ?, error = ?, completed_at = ?, updated_at = ?,
            lease_owner = NULL, lease_token_hash = NULL, lease_expires_at = NULL
      WHERE id = ? AND status = 'running' AND lease_owner = ? AND lease_token_hash = ?
        AND lease_expires_at > ?`
  ).bind(status, input.result ?? null, input.error ?? null, now, now,
    input.taskId, input.owner, tokenHash, now).run();
  if (update.meta.changes !== 1) return false;
  await audit({
    organizationId: existing.organizationId,
    actorType: input.actorType,
    actorId: input.owner,
    action: `task.${status}`,
    targetType: "task",
    targetId: input.taskId,
    metadata: {
      route: existing.route,
      generation: existing.leaseGeneration,
      durationMs: Math.max(0, now - existing.createdAt),
    },
  });
  return true;
}
