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
}

export async function claimTask(input: {
  route: "local" | "cloud";
  owner: string;
  deviceId?: string;
}): Promise<{ task: TaskCandidate & { leaseToken: string; leaseExpiresAt: number } } | null> {
  const now = Date.now();
  const routeClause = input.route === "local"
    ? "route = 'local' AND device_id = ? AND status IN ('local_pending', 'cloud_pending', 'running')"
    : "route = 'cloud' AND status IN ('cloud_pending', 'running')";
  const params = input.route === "local" ? [input.deviceId!, now] : [now];
  const candidate = await db().prepare(
    `SELECT id, organization_id AS organizationId, thread_id AS threadId, prompt,
            lease_generation AS leaseGeneration
       FROM tasks
      WHERE ${routeClause}
        AND (lease_expires_at IS NULL OR lease_expires_at < ?)
      ORDER BY created_at ASC LIMIT 1`
  ).bind(...params).first<TaskCandidate>();
  if (!candidate) return null;

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
  return { task: { ...candidate, leaseGeneration: candidate.leaseGeneration + 1, leaseToken, leaseExpiresAt } };
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
