import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const health = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
const cache = readFileSync(new URL("../lib/d1-read-cache.ts", import.meta.url), "utf8");

test("public /api/health is liveness-only and does not scan D1 before isAdmin", () => {
  const adminIdx = health.indexOf("await isAdmin()");
  const schemaIdx = health.indexOf("await requireCurrentSchema()");
  const telemetryIdx = health.indexOf("await collectAdminHealthTelemetry(");
  assert.ok(adminIdx > 0, "health route must call isAdmin()");
  assert.ok(schemaIdx > adminIdx, "requireCurrentSchema must run after isAdmin()");
  assert.ok(telemetryIdx > adminIdx, "admin telemetry must run after isAdmin()");
  assert.match(health, /if \(!\(await isAdmin\(\)\)\)/);
  assert.match(health, /scope: "liveness"/);
  assert.match(health, /advertisePaid: hosted\.advertisePaid/);
  assert.match(health, /publicHealthFromCache/);
  assert.doesNotMatch(health, /probeRunnerHealth/);
});

test("admin D1 schema + telemetry go through the isolate TTL cache", () => {
  assert.match(health, /d1HealthSchemaOkCache/);
  assert.match(health, /d1HealthTelemetryCache/);
  assert.match(health, /from "@\/lib\/d1-read-cache"/);
  assert.match(cache, /D1_HEALTH_SCHEMA_TTL_MS = 15 \* 60_000/);
  assert.match(cache, /D1_HEALTH_TELEMETRY_TTL_MS = 15 \* 60_000/);
  assert.match(cache, /D1_FREE_TIER_ROWS_READ_PER_DAY = 5_000_000/);
  assert.match(cache, /D1_FREE_TIER_ROWS_WRITTEN_PER_DAY = 100_000/);
});

test("fail-closed admin 503 and public liveness strings stay in the route", () => {
  assert.match(health, /required D1 migrations are missing/);
  assert.match(health, /HOSTED_DATABASE_UNAVAILABLE/);
  assert.match(health, /currentAdminSession/);
  assert.doesNotMatch(health, /service: "leash-control"/);
  assert.doesNotMatch(health, /LEASH_DATABASE_UNAVAILABLE/);
});

test("does not steal Codex AGENT-494 index files", () => {
  assert.doesNotMatch(health, /0007_health_query_indexes/);
  assert.doesNotMatch(health, /audit_events_created_idx/);
  assert.doesNotMatch(health, /audit_events_action_created_idx/);
});
