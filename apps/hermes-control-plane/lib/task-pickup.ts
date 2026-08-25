/**
 * Pickup-timeout rules for tasks that no runner ever claims.
 *
 * Dependency-free on purpose: this is the decision logic, so it stays directly
 * unit-testable without pulling in the D1 binding or the audit log.
 *
 * TASK_LEASE_MS only starts once a runner has *claimed* a task. Before that the
 * row has lease_expires_at IS NULL, so an unclaimed task has no deadline at all:
 * if no hosted runner is polling the claim endpoint (token unset, runner down,
 * deploy in flight) the task stays 'cloud_pending' forever. The dashboard
 * renders that as an eternal "CLOUD PENDING - 90s lease", and because task
 * admission counts activeTasks as `status NOT IN ('completed','failed')`, every
 * abandoned task permanently consumes one of the organization's concurrent-task
 * slots. Enough of them and the workspace can no longer create tasks at all.
 */

export const TASK_PICKUP_TIMEOUT_MS = 15 * 60_000;

export const TASK_PICKUP_TIMEOUT_ERROR =
  "No runner picked this task up within 15 minutes, so it was cancelled. Check that a hosted runner is online, then send it again.";

/** Statuses meaning "queued, nobody has taken it yet". */
export const UNCLAIMED_STATUSES = ["cloud_pending", "local_pending"] as const;

export interface PendingTaskRow {
  id: string;
  status: string;
  createdAt: number;
  /** Refreshed every time the row re-enters a queued state. */
  updatedAt?: number | null;
}

const UNCLAIMED = new Set<string>(UNCLAIMED_STATUSES);

/**
 * Given rows already read for the dashboard, return the ids of tasks queued
 * past the pickup timeout. Operates on rows the caller already holds so expiry
 * costs zero additional reads. 'needs_failover' is excluded: it is an
 * intentional wait-for-human state. 'running' is excluded: lease renewal owns
 * liveness for claimed tasks and the reaper must not race it.
 */
export function staleUnclaimedTaskIds(rows: PendingTaskRow[], now: number = Date.now()): string[] {
  const cutoff = now - TASK_PICKUP_TIMEOUT_MS;
  return rows
    .filter((row) => UNCLAIMED.has(row.status) && queuedSince(row) <= cutoff)
    .map((row) => row.id);
}

/**
 * The moment a row most recently *entered* an unclaimed state, which is what
 * the timeout must be measured from.
 *
 * created_at is the wrong clock for a requeue. POST /api/tasks/failover moves
 * an old 'needs_failover' task to 'cloud_pending' and refreshes updated_at; a
 * device heartbeat requeue does the same. Judging those by original creation
 * time cancels a failover the operator approved seconds ago, because the row
 * was born hours earlier. updated_at is refreshed by every one of those
 * transitions, so it is the age of the current wait.
 */
export function queuedSince(row: PendingTaskRow): number {
  const updated = Number(row.updatedAt);
  return Number.isFinite(updated) && updated > 0 ? updated : Number(row.createdAt);
}
