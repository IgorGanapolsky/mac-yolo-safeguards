import { audit } from "./audit";
import { db } from "./runtime";
import { randomToken, sha256 } from "./security";

const LEASE_MS = 90_000;

interface TaskCandidate {
  id: string;
  organizationId: string;
  threadId: string;
  prompt: string;
  leaseGeneration: number;
  sourceSessionId: string | null;
  contextSnapshot: string | null;
  syncedAt: number | null;
  createdAt: number;
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
            AND (d.last_seen_at IS NULL OR d.last_seen_at < ?)))`;
  const params = input.route === "local" ? [input.deviceId!, now] : [now - 60_000, now];
  const candidate = await db().prepare(
    `SELECT k.id, k.organization_id AS organizationId, k.thread_id AS threadId, k.prompt,
            k.lease_generation AS leaseGeneration, k.created_at AS createdAt,
            t.source_session_id AS sourceSessionId, t.context_snapshot AS contextSnapshot, t.synced_at AS syncedAt
       FROM tasks k JOIN threads t ON t.id = k.thread_id
       LEFT JOIN devices d ON d.id = k.device_id
      WHERE ${routeClause}
        AND (k.lease_expires_at IS NULL OR k.lease_expires_at < ?)
      ORDER BY k.created_at ASC LIMIT 1`
  ).bind(...params).first<TaskCandidate>();
  if (!candidate) return null;

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
  const leaseExpiresAt = now + LEASE_MS;
  const update = await db().prepare(
    `UPDATE tasks SET status = 'running', route = ?, lease_owner = ?, lease_token_hash = ?,
            lease_generation = lease_generation + 1, lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND lease_generation = ? AND (lease_expires_at IS NULL OR lease_expires_at < ?)`
  ).bind(input.route, input.owner, await sha256(leaseToken), leaseExpiresAt, now,
    candidate.id, candidate.leaseGeneration, now).run();
  if (update.meta.changes !== 1) return null;
  await audit({ organizationId: candidate.organizationId, actorType: input.route === "local" ? "device" : "runner", actorId: input.owner, action: "task.claim", targetType: "task", targetId: candidate.id, metadata: { route: input.route, generation: candidate.leaseGeneration + 1 } });
  return { task: {
    id: candidate.id,
    organizationId: candidate.organizationId,
    threadId: candidate.threadId,
    prompt: candidate.prompt,
    sourceSessionId: candidate.sourceSessionId,
    contextMessages,
    handoffMessages: boundMessages(handoffMessages, 24_000),
    leaseGeneration: candidate.leaseGeneration + 1,
    leaseToken,
    leaseExpiresAt,
  } };
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
  const existing = await db().prepare("SELECT organization_id AS organizationId FROM tasks WHERE id = ?")
    .bind(input.taskId).first<{ organizationId: string }>();
  if (!existing) return false;
  const update = await db().prepare(
    `UPDATE tasks SET status = ?, result = ?, error = ?, completed_at = ?, updated_at = ?,
            lease_expires_at = NULL
      WHERE id = ? AND status = 'running' AND lease_owner = ? AND lease_token_hash = ?`
  ).bind(status, input.result ?? null, input.error ?? null, now, now, input.taskId, input.owner, tokenHash).run();
  if (update.meta.changes !== 1) return false;
  await audit({ organizationId: existing.organizationId, actorType: input.actorType, actorId: input.owner, action: `task.${status}`, targetType: "task", targetId: input.taskId });
  return true;
}
