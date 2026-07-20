import AsyncStorage from '@react-native-async-storage/async-storage';
import { isPostHogCaptureEnvironmentAllowed } from './productAnalytics';

/**
 * Server-side feature flags / kill switches via the PostHog /flags endpoint.
 *
 * Reuses the EXISTING PostHog project token, host, distinct_id, and
 * production-only gate already wired in productAnalytics.ts — so there is
 * zero new dependency, zero native build, and zero app.json change.
 *
 * Design contract (fail-safe defaults):
 *  - Every flag defaults to `false` when unknown / offline / non-production.
 *    A kill switch therefore reads as "feature OFF" until the server
 *    explicitly says otherwise — a network outage never accidentally enables
 *    a disabled feature.
 *  - Flags are cached in AsyncStorage with a TTL (default 15 min). When the
 *    fetch fails or the environment gate is closed, the last cached value is
 *    used; if there is no cache the safe default is returned.
 *  - No throw: any network/parse/storage error resolves to the safe default.
 */

const CACHE_KEY = 'hermes-mobile:remote_config_flags';
const CACHE_TS_KEY = 'hermes-mobile:remote_config_ts';
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

const posthogConfig = {
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com',
  key: process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || '',
  ttlMs: DEFAULT_TTL_MS,
};

/** @internal Test seam — override host/key/ttl without env inlining. */
export function __setRemoteConfigForTesting(cfg: {
  host?: string;
  key?: string;
  ttlMs?: number;
}): void {
  if (cfg.host !== undefined) posthogConfig.host = cfg.host;
  if (cfg.key !== undefined) posthogConfig.key = cfg.key;
  if (cfg.ttlMs !== undefined) posthogConfig.ttlMs = cfg.ttlMs;
}

function posthogHost(): string {
  return posthogConfig.host;
}

function posthogKey(): string {
  return posthogConfig.key;
}

/** Distinct id reused from productAnalytics storage for consistent evaluation. */
const DISTINCT_ID_KEY = 'hermes.analytics.distinct_id';

async function getDistinctId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DISTINCT_ID_KEY);
    if (existing?.trim()) {
      return existing.trim();
    }
    const created = `hm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DISTINCT_ID_KEY, created);
    return created;
  } catch {
    return 'hermes-mobile-anon';
  }
}

type FlagValue = boolean | string;
type FlagMap = Record<string, FlagValue>;

let memoryCache: FlagMap | null = null;
let memoryCacheTs = 0;

function cacheIsFresh(now: number): boolean {
  return memoryCache !== null && now - memoryCacheTs < posthogConfig.ttlMs;
}

async function readDiskCache(): Promise<FlagMap | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as FlagMap) : null;
  } catch {
    return null;
  }
}

async function writeDiskCache(flags: FlagMap): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(flags));
    await AsyncStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch {
    /* best effort */
  }
}

/**
 * Fetch all flags from the PostHog /flags?v=2 endpoint and update the cache.
 * Returns the freshly-fetched map, or null if the fetch was skipped/failed.
 * Never throws.
 */
export async function refreshRemoteConfig(): Promise<FlagMap | null> {
  const key = posthogKey();
  if (!key || !isPostHogCaptureEnvironmentAllowed()) {
    // Non-production or no key: do not hit the network. Callers fall back to
    // safe defaults (no flag is ever server-enabled in dev/test builds).
    return null;
  }
  try {
    const distinctId = await getDistinctId();
    const res = await fetch(`${posthogHost().replace(/\/+$/, '')}/flags?v=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: key, distinct_id: distinctId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { featureFlags?: FlagMap };
    const flags = data?.featureFlags ?? {};
    memoryCache = flags;
    memoryCacheTs = Date.now();
    await writeDiskCache(flags);
    return flags;
  } catch {
    return null;
  }
}

/**
 * Resolve the current flag map: memory cache if fresh, else disk cache.
 * Does NOT trigger a network fetch. Call refreshRemoteConfig() to populate.
 */
async function currentFlags(): Promise<FlagMap> {
  const now = Date.now();
  if (cacheIsFresh(now) && memoryCache !== null) {
    return memoryCache;
  }
  const disk = await readDiskCache();
  if (disk) {
    memoryCache = disk;
    const tsRaw = await AsyncStorage.getItem(CACHE_TS_KEY);
    memoryCacheTs = tsRaw ? Number(tsRaw) || 0 : 0;
    return disk;
  }
  return {};
}

/**
 * Read a boolean feature flag / kill switch.
 * Returns `defaultValue` (default `false`) when the flag is absent, offline,
 * or the environment gate is closed. Never throws.
 *
 * Kill-switch convention: the SAFE default is `false`, meaning the server must
 * explicitly enable a flag for the feature to be on.
 */
export async function getBooleanFlag(
  flagKey: string,
  defaultValue = false,
): Promise<boolean> {
  const flags = await currentFlags();
  const v = flags[flagKey];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return defaultValue;
}

/**
 * Synchronous best-effort read of a boolean flag from the in-memory cache.
 * Use only for hot paths that already called refreshRemoteConfig() earlier in
 * the session. Falls back to defaultValue when the memory cache is empty.
 */
export function getBooleanFlagSync(
  flagKey: string,
  defaultValue = false,
): boolean {
  if (!memoryCache) return defaultValue;
  const v = memoryCache[flagKey];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return defaultValue;
}

/** Whether the memory/disk cache has been populated at least once. */
export function isRemoteConfigInitialized(): boolean {
  return memoryCache !== null;
}

/** Clear both memory and disk cache (test helper / reset). */
export async function clearRemoteConfigCache(): Promise<void> {
  memoryCache = null;
  memoryCacheTs = 0;
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
    await AsyncStorage.removeItem(CACHE_TS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @internal Test seam — clear the in-memory cache ONLY, leaving the disk
 * cache intact. Models an app cold start so the disk-fallback path can be
 * exercised without wiping persisted flags.
 */
export function __resetMemoryCacheForTesting(): void {
  memoryCache = null;
  memoryCacheTs = 0;
}
