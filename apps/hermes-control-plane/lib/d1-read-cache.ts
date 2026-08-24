/**
 * Isolate-local TTL cache for expensive D1 reads.
 *
 * Cloudflare D1 free tier (enforced 2026-09-01): 5e6 rows read / 1e5 rows
 * written per UTC day. Nested COUNT(*) on audit_events (~74k rows, no
 * covering index) cost ~493k rows per /api/health poll. 7d provider
 * baseline: 1,754 of those polls read 865,801,023 rows.
 *
 * Public liveness must not hit D1 at all. Admin telemetry is cached here
 * so dashboard/watchdog polling cannot full-scan on every request.
 *
 * HTTP Cache-Control stays no-store (CDN must not cache health). This is
 * Worker isolate memory only — isolates recycle, so TTL is a ceiling, not
 * a global singleton.
 */

export const D1_FREE_TIER_ROWS_READ_PER_DAY = 5_000_000;
export const D1_FREE_TIER_ROWS_WRITTEN_PER_DAY = 100_000;
export const D1_HEALTH_SCHEMA_TTL_MS = 15 * 60_000;
export const D1_HEALTH_TELEMETRY_TTL_MS = 15 * 60_000;
export const D1_FREE_TIER_WARN_RATIO = 0.8;

export class IsolateTtlCache<T> {
  private entry: { at: number; value: T } | null = null;
  ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(now: number): T | null {
    if (!this.entry) return null;
    if (now - this.entry.at >= this.ttlMs) return null;
    return this.entry.value;
  }

  set(now: number, value: T): T {
    this.entry = { at: now, value };
    return value;
  }

  clear(): void {
    this.entry = null;
  }
}

export const d1HealthSchemaOkCache = new IsolateTtlCache<true>(D1_HEALTH_SCHEMA_TTL_MS);
export const d1HealthTelemetryCache = new IsolateTtlCache<unknown>(D1_HEALTH_TELEMETRY_TTL_MS);

export function resetD1ReadCaches(): void {
  d1HealthSchemaOkCache.clear();
  d1HealthTelemetryCache.clear();
}

export type D1FreeTierUsage = {
  rows_read_24h: number;
  rows_written_24h: number;
};

export type D1FreeTierVerdict = {
  status: "ok" | "warn" | "exceeded";
  rows_read_24h: number;
  rows_written_24h: number;
  free_reads: number;
  free_writes: number;
  read_ratio: number;
  write_ratio: number;
};

export function evaluateD1FreeTier(usage: D1FreeTierUsage): D1FreeTierVerdict {
  const rows_read_24h = Number(usage.rows_read_24h) || 0;
  const rows_written_24h = Number(usage.rows_written_24h) || 0;
  const read_ratio = rows_read_24h / D1_FREE_TIER_ROWS_READ_PER_DAY;
  const write_ratio = rows_written_24h / D1_FREE_TIER_ROWS_WRITTEN_PER_DAY;
  let status: D1FreeTierVerdict["status"] = "ok";
  if (read_ratio >= 1 || write_ratio >= 1) status = "exceeded";
  else if (read_ratio >= D1_FREE_TIER_WARN_RATIO || write_ratio >= D1_FREE_TIER_WARN_RATIO) {
    status = "warn";
  }
  return {
    status,
    rows_read_24h,
    rows_written_24h,
    free_reads: D1_FREE_TIER_ROWS_READ_PER_DAY,
    free_writes: D1_FREE_TIER_ROWS_WRITTEN_PER_DAY,
    read_ratio,
    write_ratio,
  };
}
