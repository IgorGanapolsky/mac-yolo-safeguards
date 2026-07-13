import type { PendingApproval } from '../types/gateway';

/**
 * Hard ceiling on in-memory Leash pending approvals.
 * Without this, a runaway GATE.BLOCKED / relay queue (thousands of unique
 * actionIds) freezes the Leash tab (map of cards) and badge/notifications.
 * Newest first — callers prepend; we keep the head of the list.
 */
export const MAX_PENDING_APPROVALS = 40;

/** Tab badge / notification badge: never show raw thousands. */
export const PENDING_BADGE_DISPLAY_CAP = 99;

export function capPendingApprovals(
  pending: PendingApproval[],
  max: number = MAX_PENDING_APPROVALS,
): PendingApproval[] {
  if (pending.length <= max) {
    return pending;
  }
  return pending.slice(0, max);
}

export function formatPendingApprovalsBadge(count: number): string {
  if (count <= 0) {
    return '';
  }
  if (count > PENDING_BADGE_DISPLAY_CAP) {
    return `${PENDING_BADGE_DISPLAY_CAP}+`;
  }
  return String(count);
}

/**
 * Dedup + cap when merging a new approval. Returns previous array reference
 * when unchanged so React can skip re-renders.
 */
export function prependPendingApproval(
  prev: PendingApproval[],
  next: PendingApproval,
  keyOf: (item: PendingApproval) => string = (item) => item.runId ?? item.actionId,
): PendingApproval[] {
  const key = keyOf(next);
  if (!key || prev.some((item) => keyOf(item) === key)) {
    return prev;
  }
  return capPendingApprovals([next, ...prev]);
}
