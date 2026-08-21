import { GATED_TOOL_CLASSES, type GatedToolClass } from "./hosted-tool-approvals";
import { sanitizeText } from "./security";

export const ACTION_CLASSES = GATED_TOOL_CLASSES;
export type ActionClass = GatedToolClass;
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "consumed";
export type ApprovalDecision = "approved" | "denied";

const DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;
const MIN_TTL_MS = 30_000;
const MAX_TTL_MS = 15 * 60 * 1000;
const UNSAFE_SUMMARY = /[{}[\]\n\r]|(?:token|secret|password|api[ _-]?key)\s*[:=]|\bbearer\s+[A-Za-z0-9._-]{6,}|\bsk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|https?:\/\/\S+\?/i;

export interface ApprovalRecord {
  id: string;
  taskId: string;
  executorId: string;
  actionClass: ActionClass;
  summary: string;
  argumentDigest: string;
  status: ApprovalStatus;
  expiresAt: number;
  requestedAt: number;
  decidedAt: number | null;
  decidedByUserId: string | null;
  consumedAt: number | null;
  updatedAt: number;
}

export function cleanActionClass(value: unknown): ActionClass | null {
  return typeof value === "string" && ACTION_CLASSES.includes(value as ActionClass) ? value as ActionClass : null;
}

export function cleanApprovalSummary(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const summary = sanitizeText(value, 180);
  if (summary.length < 8 || UNSAFE_SUMMARY.test(value)) return null;
  return summary;
}

export function cleanArgumentDigest(value: unknown): string | null {
  return typeof value === "string" && DIGEST_PATTERN.test(value) ? value : null;
}

export function cleanIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && IDEMPOTENCY_PATTERN.test(value) ? value : null;
}

export function cleanApprovalTtl(value: unknown): number | null {
  const ttl = Number(value);
  return Number.isSafeInteger(ttl) && ttl >= MIN_TTL_MS && ttl <= MAX_TTL_MS ? ttl : null;
}

async function expireApprovals(database: D1Database, now: number, organizationId?: string): Promise<void> {
  const whereOrganization = organizationId ? " AND organization_id = ?" : "";
  const statement = database.prepare(
    `UPDATE action_approval_requests SET status = 'expired', updated_at = ?
      WHERE status = 'pending' AND expires_at <= ?${whereOrganization}`,
  );
  await (organizationId ? statement.bind(now, now, organizationId) : statement.bind(now, now)).run();
}

export async function openApprovalRequest(database: D1Database, input: {
  runnerId: string;
  taskId: string;
  idempotencyKey: string;
  actionClass: ActionClass;
  summary: string;
  argumentDigest: string;
  ttlMs: number;
  now?: number;
}): Promise<{ ok: true; approval: ApprovalRecord; created: boolean } | { ok: false; reason: string }> {
  const now = input.now ?? Date.now();
  const owner = `cloud:${input.runnerId}`;
  const task = await database.prepare(
    `SELECT organization_id AS organizationId FROM tasks
      WHERE id = ? AND route = 'cloud' AND status = 'running' AND lease_owner = ? AND lease_expires_at > ?`,
  ).bind(input.taskId, owner, now).first<{ organizationId: string }>();
  if (!task) return { ok: false, reason: "active cloud task lease not found" };

  const id = crypto.randomUUID();
  const expiresAt = now + input.ttlMs;
  await database.batch([
    database.prepare(
      `INSERT INTO action_approval_requests
        (id, organization_id, task_id, executor_id, idempotency_key, action_class, summary,
         argument_digest, status, expires_at, requested_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
       ON CONFLICT(executor_id, idempotency_key) DO NOTHING`,
    ).bind(id, task.organizationId, input.taskId, input.runnerId, input.idempotencyKey, input.actionClass,
      input.summary, input.argumentDigest, expiresAt, now, now),
    database.prepare(
      `INSERT INTO audit_events
        (id, organization_id, actor_type, actor_id, action, target_type, target_id, metadata, created_at)
       SELECT ?, organization_id, 'runner', executor_id, 'approval.requested', 'action_approval', id, ?, ?
         FROM action_approval_requests WHERE id = ?`,
    ).bind(crypto.randomUUID(), JSON.stringify({
      taskId: input.taskId,
      actionClass: input.actionClass,
      argumentDigest: input.argumentDigest,
      expiresAt,
    }), now, id),
  ]);

  const approval = await database.prepare(
    `SELECT id, task_id AS taskId, executor_id AS executorId, action_class AS actionClass,
            summary, argument_digest AS argumentDigest, status, expires_at AS expiresAt,
            requested_at AS requestedAt, decided_at AS decidedAt,
            decided_by_user_id AS decidedByUserId, consumed_at AS consumedAt, updated_at AS updatedAt
       FROM action_approval_requests WHERE executor_id = ? AND idempotency_key = ?`,
  ).bind(input.runnerId, input.idempotencyKey).first<ApprovalRecord>();
  if (!approval) return { ok: false, reason: "approval request was not persisted" };
  if (approval.taskId !== input.taskId || approval.actionClass !== input.actionClass ||
      approval.summary !== input.summary || approval.argumentDigest !== input.argumentDigest) {
    return { ok: false, reason: "idempotency key conflicts with another approval request" };
  }
  const created = approval.id === id;
  return { ok: true, approval, created };
}

export async function pollApprovalRequest(database: D1Database, input: {
  runnerId: string;
  approvalId: string;
  now?: number;
}): Promise<ApprovalRecord | null> {
  const now = input.now ?? Date.now();
  await expireApprovals(database, now);
  return database.prepare(
    `SELECT id, task_id AS taskId, executor_id AS executorId, action_class AS actionClass,
            summary, argument_digest AS argumentDigest, status, expires_at AS expiresAt,
            requested_at AS requestedAt, decided_at AS decidedAt,
            decided_by_user_id AS decidedByUserId, consumed_at AS consumedAt, updated_at AS updatedAt
       FROM action_approval_requests WHERE id = ? AND executor_id = ?`,
  ).bind(input.approvalId, input.runnerId).first<ApprovalRecord>();
}

export async function listOrganizationApprovals(database: D1Database, organizationId: string, now = Date.now()): Promise<{
  pendingCount: number;
  approvals: ApprovalRecord[];
}> {
  await expireApprovals(database, now, organizationId);
  const rows = await database.prepare(
    `SELECT id, task_id AS taskId, executor_id AS executorId, action_class AS actionClass,
            summary, argument_digest AS argumentDigest, status, expires_at AS expiresAt,
            requested_at AS requestedAt, decided_at AS decidedAt,
            decided_by_user_id AS decidedByUserId, consumed_at AS consumedAt, updated_at AS updatedAt
       FROM action_approval_requests WHERE organization_id = ?
      ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, requested_at DESC LIMIT 50`,
  ).bind(organizationId).all<ApprovalRecord>();
  return {
    pendingCount: rows.results.filter((row) => row.status === "pending").length,
    approvals: rows.results,
  };
}

export async function decideApprovalRequest(database: D1Database, input: {
  organizationId: string;
  userId: string;
  approvalId: string;
  decision: ApprovalDecision;
  now?: number;
}): Promise<{ ok: true; approval: ApprovalRecord } | { ok: false; reason: string }> {
  const now = input.now ?? Date.now();
  await expireApprovals(database, now, input.organizationId);
  const [, updated] = await database.batch([
    database.prepare(
      `INSERT INTO audit_events
        (id, organization_id, actor_type, actor_id, action, target_type, target_id, metadata, created_at)
       SELECT ?, organization_id, 'user', ?, ?, 'action_approval', id,
              json_object('taskId', task_id, 'actionClass', action_class, 'argumentDigest', argument_digest), ?
         FROM action_approval_requests
        WHERE id = ? AND organization_id = ? AND status = 'pending' AND expires_at > ? AND executor_id <> ?`,
    ).bind(crypto.randomUUID(), input.userId, `approval.${input.decision}`, now,
      input.approvalId, input.organizationId, now, input.userId),
    database.prepare(
      `UPDATE action_approval_requests SET status = ?, decided_at = ?, decided_by_user_id = ?, updated_at = ?
        WHERE id = ? AND organization_id = ? AND status = 'pending' AND expires_at > ? AND executor_id <> ?`,
    ).bind(input.decision, now, input.userId, now, input.approvalId, input.organizationId, now, input.userId),
  ]);
  if (updated.meta.changes !== 1) return { ok: false, reason: "approval is missing, expired, or already decided" };
  const owner = await database.prepare(
    "SELECT executor_id AS executorId FROM action_approval_requests WHERE id = ? AND organization_id = ?",
  ).bind(input.approvalId, input.organizationId).first<{ executorId: string }>();
  if (!owner) return { ok: false, reason: "approval decision could not be read back" };
  const approval = await pollApprovalRequest(database, {
    runnerId: owner.executorId,
    approvalId: input.approvalId,
    now,
  });
  if (!approval) return { ok: false, reason: "approval decision could not be read back" };
  return { ok: true, approval };
}

export async function consumeApprovalRequest(database: D1Database, input: {
  runnerId: string;
  approvalId: string;
  now?: number;
}): Promise<{ ok: true; approval: ApprovalRecord } | { ok: false; reason: string }> {
  const now = input.now ?? Date.now();
  await expireApprovals(database, now);
  const [, updated] = await database.batch([
    database.prepare(
      `INSERT INTO audit_events
        (id, organization_id, actor_type, actor_id, action, target_type, target_id, metadata, created_at)
       SELECT ?, organization_id, 'runner', ?, 'approval.consumed', 'action_approval', id,
              json_object('taskId', task_id, 'actionClass', action_class, 'argumentDigest', argument_digest), ?
         FROM action_approval_requests
        WHERE id = ? AND executor_id = ? AND status = 'approved' AND expires_at > ?`,
    ).bind(crypto.randomUUID(), input.runnerId, now, input.approvalId, input.runnerId, now),
    database.prepare(
      `UPDATE action_approval_requests SET status = 'consumed', consumed_at = ?, consumed_by_runner_id = ?, updated_at = ?
        WHERE id = ? AND executor_id = ? AND status = 'approved' AND expires_at > ?`,
    ).bind(now, input.runnerId, now, input.approvalId, input.runnerId, now),
  ]);
  if (updated.meta.changes !== 1) return { ok: false, reason: "approval is not approved, has expired, or was already consumed" };
  const approval = await pollApprovalRequest(database, { runnerId: input.runnerId, approvalId: input.approvalId, now });
  if (!approval) return { ok: false, reason: "consumed approval could not be read back" };
  return { ok: true, approval };
}
