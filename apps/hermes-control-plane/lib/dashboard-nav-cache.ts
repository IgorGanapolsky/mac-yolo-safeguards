/**
 * Client-side navigation cache for ThumbGate dashboard (GitHub Issues-style SWR).
 * Shell-first: paint sessionStorage hits immediately; network revalidates in the background.
 * In-memory map holds thread message snapshots for instant thread switches + hover prefetch.
 *
 * Privacy: sessionStorage only (tab-scoped). clearDashboardNavCache() on sign-out.
 * Not for secrets or long-lived PII archives.
 */

export const DASHBOARD_CACHE_KEYS = Object.freeze({
  me: "thumbgate.cache.me",
  devices: "thumbgate.cache.devices",
  threads: "thumbgate.cache.threads",
  tasks: "thumbgate.cache.tasks",
  selectedThread: "thumbgate.cache.selectedThread",
  threadDetailsPrefix: "thumbgate.cache.threadDetails.",
});

/** Cap thread detail cache entries in sessionStorage (small read-heavy graph). */
export const MAX_THREAD_DETAIL_CACHE = 8;

/** How long a thread-detail entry is treated as fresh enough to skip network (ms). */
export const THREAD_DETAIL_FRESH_MS = 15_000;

export type CachedIdentity<TUser, TOrg> = {
  user: TUser;
  organization: TOrg;
  cachedAt: number;
};

export type CachedThreadDetails<TDetails> = {
  details: TDetails;
  cachedAt: number;
};

export function readJsonSessionStorage<T>(key: string): T | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJsonSessionStorage(key: string, value: unknown): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode — nav still works without cache.
  }
}

export function removeSessionStorageKey(key: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function clearDashboardNavCache(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("thumbgate.cache.")) doomed.push(key);
    }
    for (const key of doomed) sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function threadDetailsStorageKey(threadId: string): string {
  return `${DASHBOARD_CACHE_KEYS.threadDetailsPrefix}${threadId}`;
}

export function isThreadDetailFresh(cachedAt: number, now = Date.now(), freshMs = THREAD_DETAIL_FRESH_MS): boolean {
  return now - cachedAt < freshMs;
}

/**
 * LRU-ish: keep at most maxEntries thread-detail keys; drop oldest by cachedAt.
 */
export function pruneThreadDetailStorage(
  storage: { length: number; key(i: number): string | null; getItem(k: string): string | null; removeItem(k: string): void },
  maxEntries = MAX_THREAD_DETAIL_CACHE,
): void {
  const entries: { key: string; cachedAt: number }[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key || !key.startsWith(DASHBOARD_CACHE_KEYS.threadDetailsPrefix)) continue;
    try {
      const parsed = JSON.parse(storage.getItem(key) || "{}") as { cachedAt?: number };
      entries.push({ key, cachedAt: Number(parsed.cachedAt) || 0 });
    } catch {
      storage.removeItem(key);
    }
  }
  if (entries.length <= maxEntries) return;
  entries.sort((a, b) => a.cachedAt - b.cachedAt);
  const drop = entries.length - maxEntries;
  for (let i = 0; i < drop; i += 1) storage.removeItem(entries[i].key);
}

/** Top-N thread ids to preheat after list load (small graph, read-heavy). */
export function selectPreheatThreadIds(
  threads: { id: string }[],
  selectedThreadId: string | null,
  limit = 3,
): string[] {
  const ids: string[] = [];
  if (selectedThreadId) ids.push(selectedThreadId);
  for (const thread of threads) {
    if (ids.length >= limit) break;
    if (!ids.includes(thread.id)) ids.push(thread.id);
  }
  return ids.slice(0, limit);
}
