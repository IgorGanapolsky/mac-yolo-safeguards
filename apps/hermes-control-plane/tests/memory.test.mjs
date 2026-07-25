import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { classifyMemoryType, extractTags, splitIntoSentences, generateMemoryId } from "../lib/memory/classify.ts";

function createTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE memory_entries (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL,
      content TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'fact', source TEXT NOT NULL,
      source_id TEXT, tags TEXT, confidence REAL DEFAULT 1.0 NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER
    );
    CREATE TABLE agent_shared_context (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, context_key TEXT NOT NULL,
      context_value TEXT NOT NULL, version INTEGER DEFAULT 1 NOT NULL,
      created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE memory_ingestion_log (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL,
      source TEXT NOT NULL, source_id TEXT, entries_created INTEGER DEFAULT 0,
      entries_updated INTEGER DEFAULT 0, status TEXT DEFAULT 'completed',
      error TEXT, created_at INTEGER NOT NULL
    );
  `);
  return db;
}

const TEST_ORG = "test-org-memory";
const TEST_USER = "test-user-memory";

function insertMemory(db, entry) {
  const id = entry.id ?? generateMemoryId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO memory_entries (id, organization_id, user_id, content, type, source, source_id, tags, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, entry.organization_id ?? TEST_ORG, entry.user_id ?? TEST_USER,
        entry.content, entry.type ?? "fact", entry.source ?? "chat",
        entry.source_id ?? null, entry.tags ? JSON.stringify(entry.tags) : null,
        entry.confidence ?? 1.0, entry.created_at ?? now, entry.updated_at ?? now);
  return { id, ...entry, tags: entry.tags ? JSON.stringify(entry.tags) : null };
}

test("classifyMemoryType identifies preferences", () => {
  assert.equal(classifyMemoryType("User prefers dark mode"), "preference");
  assert.equal(classifyMemoryType("I like Python"), "preference");
  assert.equal(classifyMemoryType("User dislikes long meetings"), "preference");
});

test("classifyMemoryType identifies approvals", () => {
  assert.equal(classifyMemoryType("User approved the deploy"), "approval");
  assert.equal(classifyMemoryType("Block this IP address"), "approval");
  assert.equal(classifyMemoryType("Allow SSH access"), "approval");
});

test("classifyMemoryType identifies device facts", () => {
  assert.equal(classifyMemoryType("My Mac is on Tailscale"), "device");
  assert.equal(classifyMemoryType("USB cable connected"), "device");
  assert.equal(classifyMemoryType("The device is offline"), "device");
});

test("classifyMemoryType identifies patterns", () => {
  assert.equal(classifyMemoryType("User always deploys on Friday"), "pattern");
  assert.equal(classifyMemoryType("Never commit to main"), "pattern");
});

test("classifyMemoryType defaults to fact", () => {
  assert.equal(classifyMemoryType("The sky is blue"), "fact");
  assert.equal(classifyMemoryType("React 19 was released"), "fact");
});

test("extractTags finds relevant category tags", () => {
  assert.deepEqual(extractTags("Let me build and deploy this app"), ["coding", "ops"]);
  assert.deepEqual(extractTags("Fix the crash bug in production"), ["debugging"]);
  assert.deepEqual(extractTags("Schedule a standup meeting"), ["meetings"]);
  assert.deepEqual(extractTags("Plan the sprint roadmap"), ["planning"]);
  assert.deepEqual(extractTags("Hello world"), []);
});

test("splitIntoSentences breaks text into meaningful chunks", () => {
  const sentences = splitIntoSentences("First sentence here. Second one! Third?");
  assert.equal(sentences.length, 1);
  assert.equal(sentences[0], "First sentence here");
});

test("splitIntoSentences keeps longer sentences", () => {
  const sentences = splitIntoSentences("This is a long enough sentence. This one is also sufficiently long to keep.");
  assert.equal(sentences.length, 2);
});

test("splitIntoSentences filters very short fragments", () => {
  const sentences = splitIntoSentences("Hi. Ok. This is a long enough sentence to keep.");
  assert.equal(sentences.length, 1);
});

test("generateMemoryId produces unique ids with prefix", () => {
  const id1 = generateMemoryId();
  const id2 = generateMemoryId();
  assert.ok(id1.startsWith("mem_"));
  assert.notEqual(id1, id2);
});

test("SQLite memory_entries CRUD", () => {
  const db = createTestDb();
  const entry = insertMemory(db, { content: "Test fact", type: "fact" });

  const found = db.prepare("SELECT * FROM memory_entries WHERE id = ?").get(entry.id);
  assert.equal(found.content, "Test fact");
  assert.equal(found.type, "fact");

  db.prepare("UPDATE memory_entries SET content = ? WHERE id = ?").run("Updated", entry.id);
  const updated = db.prepare("SELECT * FROM memory_entries WHERE id = ?").get(entry.id);
  assert.equal(updated.content, "Updated");

  db.prepare("DELETE FROM memory_entries WHERE id = ?").run(entry.id);
  const deleted = db.prepare("SELECT * FROM memory_entries WHERE id = ?").get(entry.id);
  assert.equal(deleted, undefined);

  db.close();
});

test("SQLite search by content LIKE", () => {
  const db = createTestDb();
  insertMemory(db, { content: "User loves dark mode" });
  insertMemory(db, { content: "User hates light mode" });
  insertMemory(db, { content: "Device is MacBook" });

  const results = db.prepare("SELECT * FROM memory_entries WHERE content LIKE ?").all("%mode%");
  assert.equal(results.length, 2);
  db.close();
});

test("SQLite agent_shared_context upsert with versioning", () => {
  const db = createTestDb();
  const now = Date.now();

  db.prepare(
    `INSERT INTO agent_shared_context (id, organization_id, context_key, context_value, version, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
  ).run("ctx_1", TEST_ORG, "agent:gateway", "Load: 42%", "system", now, now);

  db.prepare(
    `UPDATE agent_shared_context SET context_value = ?, version = version + 1, updated_at = ? WHERE organization_id = ? AND context_key = ?`
  ).run("Load: 67%", now, TEST_ORG, "agent:gateway");

  const ctx = db.prepare("SELECT * FROM agent_shared_context WHERE context_key = ?").get("agent:gateway");
  assert.equal(ctx.version, 2);
  assert.ok(ctx.context_value.includes("67%"));

  db.close();
});

test("SQLite stats aggregation queries", () => {
  const db = createTestDb();
  insertMemory(db, { content: "Fact 1", type: "fact", source: "chat", confidence: 0.9 });
  insertMemory(db, { content: "Pref 1", type: "preference", source: "chat", confidence: 0.8 });
  insertMemory(db, { content: "Device 1", type: "device", source: "device", confidence: 0.7 });

  const total = db.prepare("SELECT COUNT(*) as c FROM memory_entries WHERE organization_id = ?").get(TEST_ORG);
  assert.equal(total.c, 3);

  const byType = db.prepare("SELECT type, COUNT(*) as c FROM memory_entries WHERE organization_id = ? GROUP BY type").all(TEST_ORG);
  assert.equal(byType.length, 3);

  const avgConf = db.prepare("SELECT AVG(confidence) as c FROM memory_entries WHERE organization_id = ? AND confidence IS NOT NULL").get(TEST_ORG);
  assert.ok(avgConf.c > 0.7 && avgConf.c < 0.9);

  db.close();
});