import type { PendingApproval } from '../types/gateway';

/** Hard ceiling on in-memory pending approvals (WS + relay can otherwise unbounded-grow). */
export const PENDING_APPROVALS_HARD_CAP = 100;

/** Tab / OS badge shows 99+ beyond this. */
export const PENDING_BADGE_DISPLAY_CAP = 99;

/** Leash list never mounts more than this many cards (stack mode above this). */
export const PENDING_APPROVALS_RENDER_CAP = 25;

export function pendingApprovalDedupeKey(item: {
  actionId: string;
  runId?: string | null;
}): string {
  const runId = typeof item.runId === 'string' ? item.runId.trim() : '';
  if (runId) {
    return `run:${runId}`;
  }
  return `action:${item.actionId}`;
}

/**
 * Dedupe by runId (preferred) or actionId, keep first-seen order, hard-cap length.
 * Call on every ingest path so badge/notifications cannot explode.
 */
export function dedupeAndCapPendingApprovals<T extends { actionId: string; runId?: string | null }>(
  items: T[],
  cap: number = PENDING_APPROVALS_HARD_CAP,
): T[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item?.actionId) {
      continue;
    }
    const key = pendingApprovalDedupeKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
    if (out.length >= cap) {
      break;
    }
  }
  return out;
}

export function formatPendingApprovalBadge(count: number): string {
  if (!Number.isFinite(count) || count <= 0) {
    return '';
  }
  if (count > PENDING_BADGE_DISPLAY_CAP) {
    return `${PENDING_BADGE_DISPLAY_CAP}+`;
  }
  return String(Math.floor(count));
}

/** Stable signature for notification re-fire suppression (order-independent). */
export function pendingApprovalsSignature(items: PendingApproval[]): string {
  if (!items.length) {
    return '0';
  }
  const ids = items.map((item) => item.actionId).sort();
  return `${items.length}:${ids.join(',')}`;
}

export function cappedBadgeCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  return Math.min(Math.floor(count), PENDING_BADGE_DISPLAY_CAP);
}
