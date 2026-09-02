import assert from "node:assert/strict";
import test from "node:test";
import {
  D1_FREE_TIER_ROWS_READ_PER_DAY,
  D1_FREE_TIER_ROWS_WRITTEN_PER_DAY,
  D1_HEALTH_SCHEMA_TTL_MS,
  D1_HEALTH_TELEMETRY_TTL_MS,
  IsolateTtlCache,
  d1HealthSchemaOkCache,
  d1HealthTelemetryCache,
  evaluateD1FreeTier,
  resetD1ReadCaches,
} from "../lib/d1-read-cache.ts";

test("IsolateTtlCache misses until set, then hits until TTL", () => {
  const cache = new IsolateTtlCache(1_000);
  assert.equal(cache.get(0), null);
  cache.set(0, 42);
  assert.equal(cache.get(0), 42);
  assert.equal(cache.get(999), 42);
  assert.equal(cache.get(1_000), null);
  assert.equal(cache.get(1_001), null);
});

test("IsolateTtlCache clear drops a still-fresh entry", () => {
  const cache = new IsolateTtlCache(60_000);
  cache.set(10, "ok");
  assert.equal(cache.get(20), "ok");
  cache.clear();
  assert.equal(cache.get(20), null);
});

test("shared D1 health caches expire at 15 minutes", () => {
  resetD1ReadCaches();
  assert.equal(D1_HEALTH_SCHEMA_TTL_MS, 15 * 60_000);
  assert.equal(D1_HEALTH_TELEMETRY_TTL_MS, 15 * 60_000);
  const now = 1_700_000_000_000;
  d1HealthSchemaOkCache.set(now, true);
  d1HealthTelemetryCache.set(now, { usersTotal: 5 });
  assert.equal(d1HealthSchemaOkCache.get(now + D1_HEALTH_SCHEMA_TTL_MS - 1), true);
  assert.deepEqual(d1HealthTelemetryCache.get(now + D1_HEALTH_TELEMETRY_TTL_MS - 1), { usersTotal: 5 });
  assert.equal(d1HealthSchemaOkCache.get(now + D1_HEALTH_SCHEMA_TTL_MS), null);
  assert.equal(d1HealthTelemetryCache.get(now + D1_HEALTH_TELEMETRY_TTL_MS), null);
  resetD1ReadCaches();
  assert.equal(d1HealthSchemaOkCache.get(now), null);
  assert.equal(d1HealthTelemetryCache.get(now), null);
});

test("evaluateD1FreeTier is ok under today's measured 24h usage and exceeded at the caps", () => {
  const today = evaluateD1FreeTier({ rows_read_24h: 807_610, rows_written_24h: 12_051 });
  assert.equal(today.status, "ok");
  assert.equal(today.free_reads, D1_FREE_TIER_ROWS_READ_PER_DAY);
  assert.equal(today.free_writes, D1_FREE_TIER_ROWS_WRITTEN_PER_DAY);
  assert.ok(today.read_ratio < 0.2);
  assert.ok(today.write_ratio < 0.2);
  assert.equal(evaluateD1FreeTier({ rows_read_24h: 4_000_000, rows_written_24h: 1 }).status, "warn");
  assert.equal(evaluateD1FreeTier({ rows_read_24h: 5_000_000, rows_written_24h: 0 }).status, "exceeded");
  assert.equal(evaluateD1FreeTier({ rows_read_24h: 0, rows_written_24h: 100_000 }).status, "exceeded");
  assert.equal(evaluateD1FreeTier({ rows_read_24h: 865_801_023, rows_written_24h: 12_051 }).status, "exceeded");
});
