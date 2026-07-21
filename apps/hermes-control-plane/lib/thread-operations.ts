import { audit } from "./audit";
import { db } from "./runtime";
import { randomToken, sha256 } from "./security";

const LEASE_MS = 90_000;
const MAX_ATTEMPTS = 3;

type OperationKind = "rename" | "delete" | "clear_all";

interface ThreadRow {
  id: string;
  deviceId: string | null;
  sourceSessionId: string | null;
  deletedAt: number | null;
}

interface OperationRow {
  id: string;
  organizationId: string;
  deviceId: string;
  threadId: string | null;
  sourceSessionId: string | null;
  operation: OperationKind;
  title: string | null;
  leaseGeneration: number;
}

export class ThreadOperationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function cleanThreadTitle(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replaceAll("\u0000", "").replace(/\s+/g, " ").trim().slice(0, 120);
}

async function getThread(organizationId: string, threadId: string): Promise<ThreadRow> {
  const thread = await db().prepare(
    `SELECT id, device_id AS deviceId, source_session_id AS sourceSessionId, deleted_at AS deletedAt
       FROM threads WHERE id = ? AND organization_id = ?`
  ).bind(threadId, organizationId).first<ThreadRow>();
  if (!thread || thread.deletedAt) throw new ThreadOperationError("thread not found", 404);
  return thread;
}

function operationStatement(input: {
  id: string;
  organizationId: string;
  userId: string;
  deviceId: string;
  threadId?: string | null;
  sourceSessionId?: string | null;
  operation: OperationKind;
  title?: string | null;
  now: number;
}): D1PreparedStatement {
  return db().prepare(
    `INSERT INTO thread_operations
      (id, organization_id, device_id, thread_id, source_session_id, operation, title, status,
       created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).bind(input.id, input.organizationId, input.deviceId, input.threadId ?? null,
    input.sourceSessionId ?? null, input.operation, input.title ?? null, input.userId, input.now, input.now);
}

export async function renameThread(input: {
  organizationId: string;
  userId: string;
  threadId: string;
  title: string;
}): Promise<{ title: string; operationId: string | null }> {
  const title = cleanThreadTitle(input.title);
  if (!title) throw new ThreadOperationError("title is required");
  const thread = await getThread(input.organizationId, input.threadId);
  if (thread.deviceId) {
    const duplicate = await db().prepare(
      `SELECT id FROM threads
        WHERE organization_id = ? AND device_id = ? AND id <> ? AND deleted_at IS NULL
          AND LOWER(COALESCE(title_override, title)) = LOWER(?) LIMIT 1`
    ).bind(input.organizationId, thread.deviceId, thread.id, title).first<{ id: string }>();
    if (duplicate) throw new ThreadOperationError("another chat on this machine already uses that name", 409);
  }

  const now = Date.now();
  const operationId = thread.deviceId && thread.sourceSessionId ? crypto.randomUUID() : null;
  const statements = [
    db().prepare("UPDATE threads SET title_override = ?, updated_at = ? WHERE id = ? AND organization_id = ?")
      .bind(title, now, thread.id, input.organizationId),
  ];
  if (operationId) statements.push(operationStatement({
    id: operationId, organizationId: input.organizationId, userId: input.userId,
    deviceId: thread.deviceId!, threadId: thread.id, sourceSessionId: thread.sourceSessionId,
    operation: "rename", title, now,
  }));
  await db().batch(statements);
  await audit({ organizationId: input.organizationId, actorType: "user", actorId: input.userId,
    action: "thread.rename.requested", targetType: "thread", targetId: thread.id,
    metadata: { queued: Boolean(operationId) } });
  return { title, operationId };
}

export async function deleteThread(input: {
  organizationId: string;
  userId: string;
  threadId: string;
}): Promise<{ operationId: string | null }> {
  const thread = await getThread(input.organizationId, input.threadId);
  const now = Date.now();
  const operationId = thread.deviceId && thread.sourceSessionId ? crypto.randomUUID() : null;
  const statements = [
    db().prepare("UPDATE threads SET deleted_at = ?, updated_at = ? WHERE id = ? AND organization_id = ?")
      .bind(now, now, thread.id, input.organizationId),
    db().prepare(
      `UPDATE tasks SET status = 'failed', error = 'Chat deleted', completed_at = ?, updated_at = ?, lease_expires_at = NULL
        WHERE thread_id = ? AND status NOT IN ('completed', 'failed')`
    ).bind(now, now, thread.id),
  ];
  if (operationId) statements.push(operationStatement({
    id: operationId, organizationId: input.organizationId, userId: input.userId,
    deviceId: thread.deviceId!, threadId: thread.id, sourceSessionId: thread.sourceSessionId,
    operation: "delete", now,
  }));
  await db().batch(statements);
  await audit({ organizationId: input.organizationId, actorType: "user", actorId: input.userId,
    action: "thread.delete.requested", targetType: "thread", targetId: thread.id,
    metadata: { queued: Boolean(operationId) } });
  return { operationId };
}

export async function clearThreads(input: {
  organizationId: string;
  userId: string;
}): Promise<{ cleared: number; operationIds: string[] }> {
  const rows = await db().prepare(
    `SELECT id, device_id AS deviceId, source_session_id AS sourceSessionId
       FROM threads WHERE organization_id = ? AND deleted_at IS NULL`
  ).bind(input.organizationId).all<{ id: string; deviceId: string | null; sourceSessionId: string | null }>();
  if (!rows.results.length) return { cleared: 0, operationIds: [] };

  const now = Date.now();
  const deviceIds = [...new Set(rows.results.flatMap((row) => row.deviceId ? [row.deviceId] : []))];
  const operationIds = deviceIds.map(() => crypto.randomUUID());
  const statements: D1PreparedStatement[] = [
    db().prepare("UPDATE threads SET deleted_at = ?, updated_at = ? WHERE organization_id = ? AND deleted_at IS NULL")
      .bind(now, now, input.organizationId),
    db().prepare(
      `UPDATE tasks SET status = 'failed', error = 'All chats cleared', completed_at = ?, updated_at = ?, lease_expires_at = NULL
        WHERE organization_id = ? AND status NOT IN ('completed', 'failed')`
    ).bind(now, now, input.organizationId),
  ];
  deviceIds.forEach((deviceId, index) => statements.push(operationStatement({
    id: operationIds[index], organizationId: input.organizationId, userId: input.userId,
    deviceId, operation: "clear_all", now,
  })));
  await db().batch(statements);
  await audit({ organizationId: input.organizationId, actorType: "user", actorId: input.userId,
    action: "thread.clear_all.requested", targetType: "organization", targetId: input.organizationId,
    metadata: { cleared: rows.results.length, devices: deviceIds.length } });
  return { cleared: rows.results.length, operationIds };
}

export async function claimThreadOperation(input: {
  owner: string;
  deviceId: string;
}): Promise<{ operation: OperationRow & { leaseToken: string; leaseExpiresAt: number } } | null> {
  const now = Date.now();
  const candidate = await db().prepare(
    `SELECT id, organization_id AS organizationId, device_id AS deviceId, thread_id AS threadId,
            source_session_id AS sourceSessionId, operation, title, lease_generation AS leaseGeneration
       FROM thread_operations
      WHERE device_id = ? AND status IN ('pending', 'running')
        AND (lease_expires_at IS NULL OR lease_expires_at < ?)
      ORDER BY created_at ASC, id ASC LIMIT 1`
  ).bind(input.deviceId, now).first<OperationRow>();
  if (!candidate) return null;

  const leaseToken = randomToken();
  const leaseExpiresAt = now + LEASE_MS;
  const update = await db().prepare(
    `UPDATE thread_operations SET status = 'running', lease_owner = ?, lease_token_hash = ?,
            lease_generation = lease_generation + 1, lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND lease_generation = ? AND (lease_expires_at IS NULL OR lease_expires_at < ?)`
  ).bind(input.owner, await sha256(leaseToken), leaseExpiresAt, now,
    candidate.id, candidate.leaseGeneration, now).run();
  if (update.meta.changes !== 1) return null;
  await audit({ organizationId: candidate.organizationId, actorType: "device", actorId: input.deviceId,
    action: "thread.operation.claimed", targetType: "thread_operation", targetId: candidate.id,
    metadata: { operation: candidate.operation, generation: candidate.leaseGeneration + 1 } });
  return { operation: { ...candidate, leaseGeneration: candidate.leaseGeneration + 1, leaseToken, leaseExpiresAt } };
}

export async function completeThreadOperation(input: {
  owner: string;
  deviceId: string;
  operationId: string;
  leaseToken: string;
  error?: string;
}): Promise<boolean> {
  const now = Date.now();
  const tokenHash = await sha256(input.leaseToken);
  const current = await db().prepare(
    "SELECT organization_id AS organizationId, operation, lease_generation AS leaseGeneration FROM thread_operations WHERE id = ? AND device_id = ?"
  ).bind(input.operationId, input.deviceId).first<{ organizationId: string; operation: OperationKind; leaseGeneration: number }>();
  if (!current) return false;
  const retry = Boolean(input.error) && current.leaseGeneration < MAX_ATTEMPTS;
  const status = input.error ? (retry ? "pending" : "failed") : "completed";
  const update = await db().prepare(
    `UPDATE thread_operations SET status = ?, error = ?, completed_at = ?, updated_at = ?,
            lease_owner = NULL, lease_token_hash = NULL, lease_expires_at = NULL
      WHERE id = ? AND device_id = ? AND status = 'running' AND lease_owner = ? AND lease_token_hash = ?`
  ).bind(status, input.error?.slice(0, 500) ?? null, retry ? null : now, now,
    input.operationId, input.deviceId, input.owner, tokenHash).run();
  if (update.meta.changes !== 1) return false;
  await audit({ organizationId: current.organizationId, actorType: "device", actorId: input.deviceId,
    action: `thread.operation.${status}`, targetType: "thread_operation", targetId: input.operationId,
    metadata: { operation: current.operation, attempt: current.leaseGeneration } });
  return true;
}
