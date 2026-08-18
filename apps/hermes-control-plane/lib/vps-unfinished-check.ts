/**
 * Hourly unfinished / due-soon ping that only makes sense on the hosted VPS.
 *
 * Steal: Vellum's hourly re-read of unfinished or due-soon work, without
 * interrupting an active conversation.
 * Do not steal: phone leash, Cloud vs Local picker, Continuity as a hero.
 * Laptop sleep is the fail — this contract must not fire on laptop/unknown.
 */

export const VPS_UNFINISHED_CHECK_VERSION = "2026-08-18.1";
export const VPS_UNFINISHED_CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SchedulerRuntime = "vps" | "laptop" | "unknown";
export type UnfinishedWorkKind = "unfinished" | "due_soon";

export type UnfinishedWorkItem = {
  id: string;
  kind: UnfinishedWorkKind;
  dueAt: number | null;
  summary: string;
};

export type UnfinishedCheckSkipReason =
  | "not_vps"
  | "conversation_active"
  | "interval_not_elapsed"
  | "nothing_due";

export type UnfinishedCheckResult =
  | { fire: false; version: string; reason: UnfinishedCheckSkipReason; items: [] }
  | { fire: true; version: string; reason: "unfinished_or_due_soon"; items: UnfinishedWorkItem[] };

function skip(reason: UnfinishedCheckSkipReason): UnfinishedCheckResult {
  return { fire: false, version: VPS_UNFINISHED_CHECK_VERSION, reason, items: [] };
}

function normalizeItem(item: UnfinishedWorkItem): UnfinishedWorkItem | null {
  const id = String(item?.id ?? "").trim();
  const summary = String(item?.summary ?? "").trim();
  if (!id || !summary) return null;
  if (item.kind !== "unfinished" && item.kind !== "due_soon") return null;
  const dueAt =
    item.dueAt == null || !Number.isFinite(item.dueAt) ? null : Number(item.dueAt);
  return { id, kind: item.kind, dueAt, summary };
}

export function selectPingItems(
  items: readonly UnfinishedWorkItem[],
  now: number,
  dueSoonWindowMs = DUE_SOON_WINDOW_MS,
): UnfinishedWorkItem[] {
  const selected: UnfinishedWorkItem[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const item = normalizeItem(raw);
    if (!item || seen.has(item.id)) continue;
    if (item.kind === "unfinished") {
      seen.add(item.id);
      selected.push(item);
      continue;
    }
    if (item.dueAt == null) continue;
    if (item.dueAt <= now + dueSoonWindowMs) {
      seen.add(item.id);
      selected.push(item);
    }
  }
  return selected;
}

export function evaluateUnfinishedCheck(input: {
  runtime: SchedulerRuntime | unknown;
  now: number;
  lastFiredAt: number | null;
  conversationActive: boolean;
  items: readonly UnfinishedWorkItem[];
  dueSoonWindowMs?: number;
}): UnfinishedCheckResult {
  if (input.runtime !== "vps") {
    return skip("not_vps");
  }
  if (input.conversationActive) {
    return skip("conversation_active");
  }
  if (
    input.lastFiredAt != null &&
    Number.isFinite(input.lastFiredAt) &&
    input.now - input.lastFiredAt < VPS_UNFINISHED_CHECK_INTERVAL_MS
  ) {
    return skip("interval_not_elapsed");
  }
  const items = selectPingItems(input.items, input.now, input.dueSoonWindowMs);
  if (items.length === 0) {
    return skip("nothing_due");
  }
  return {
    fire: true,
    version: VPS_UNFINISHED_CHECK_VERSION,
    reason: "unfinished_or_due_soon",
    items,
  };
}
