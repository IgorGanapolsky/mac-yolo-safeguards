import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL("../drizzle/0007_health_query_indexes.sql", import.meta.url);
const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");

test("admin health telemetry has covering audit-event indexes in schema and migration", () => {
  assert.equal(existsSync(migrationUrl), true, "health query index migration must exist");
  const migration = readFileSync(migrationUrl, "utf8");

  for (const indexName of ["audit_events_created_idx", "audit_events_action_created_idx"]) {
    assert.match(schema, new RegExp(`index\\(\"${indexName}\"\\)`));
    assert.match(migration, new RegExp(`CREATE INDEX IF NOT EXISTS \`${indexName}\``));
  }

  assert.match(schema, /audit_events_created_idx"\)\.on\(table\.createdAt\)/);
  assert.match(schema, /audit_events_action_created_idx"\)\.on\(table\.action, table\.createdAt\)/);
  assert.match(migration, /ON `audit_events` \(`created_at`\)/);
  assert.match(migration, /ON `audit_events` \(`action`, `created_at`\)/);
});
