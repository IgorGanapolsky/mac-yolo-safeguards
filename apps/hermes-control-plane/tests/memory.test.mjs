import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../lib/runtime";
import {
  createMemoryEntry,
  getMemoryEntry,
  listMemoryEntries,
  searchMemory,
  upsertMemoryEntry,
  deleteMemoryEntry,
  getMemoryStats,
  getRelevantContext,
  extractAndStoreMemories,
} from "../lib/memory";
import { updateAgentContext, getAgentContext, listAgentContexts } from "../lib/memory/agent-context";

const TEST_ORG = "test-org-memory";
const TEST_USER = "test-user-memory";

async function cleanup() {
  await db().prepare("DELETE FROM memory_entries WHERE organization_id = ?").bind(TEST_ORG).run();
  await db().prepare("DELETE FROM agent_shared_context WHERE organization_id = ?").bind(TEST_ORG).run();
  await db().prepare("DELETE FROM memory_ingestion_log WHERE organization_id = ?").bind(TEST_ORG).run();
}

test.beforeEach(async () => { await cleanup(); });
test.afterEach(async () => { await cleanup(); });

test("createMemoryEntry stores a fact and returns it", async () => {
  const entry = await createMemoryEntry({
    organization_id: TEST_ORG,
    user_id: TEST_USER,
    content: "User prefers dark mode",
    type: "preference",
    source: "chat",
    tags: ["ui", "theme"],
    confidence: 0.95,
  });
  assert.equal(entry.content, "User prefers dark mode");
  assert.equal(entry.type, "preference");
  assert.equal(entry.source, "chat");
  assert.deepEqual(JSON.parse(entry.tags!), ["ui", "theme"]);
  assert.equal(entry.confidence, 0.95);
  assert.ok(entry.id.startsWith("mem_"));
});

test("upsertMemoryEntry updates existing entry with same source+source_id", async () => {
  await createMemoryEntry({
    organization_id: TEST_ORG, user_id: TEST_USER,
    content: "Initial fact", type: "fact", source: "agent", source_id: "agent-123",
  });
  const updated = await upsertMemoryEntry(TEST_ORG, TEST_USER, "Updated fact", "fact", "agent", "agent-123", ["updated"], 0.9);
  assert.equal(updated.content, "Updated fact");
  assert.deepEqual(JSON.parse(updated.tags!), ["updated"]);
  assert.equal(updated.confidence, 0.9);
  const all = await listMemoryEntries(TEST_ORG, TEST_USER);
  assert.equal(all.length, 1);
});

test("listMemoryEntries filters by type and source", async () => {
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "Fact 1", type: "fact", source: "chat" });
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "Fact 2", type: "fact", source: "agent" });
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "Pref 1", type: "preference", source: "chat" });
  const facts = await listMemoryEntries(TEST_ORG, TEST_USER, { type: "fact" });
  assert.equal(facts.length, 2);
  const chatFacts = await listMemoryEntries(TEST_ORG, TEST_USER, { type: "fact", source: "chat" });
  assert.equal(chatFacts.length, 1);
  assert.equal(chatFacts[0].content, "Fact 1");
});

test("searchMemory finds entries by content query", async () => {
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "User loves dark mode theme", type: "preference", source: "chat" });
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "User hates light mode", type: "preference", source: "chat" });
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "Device is MacBook Pro", type: "device", source: "device" });
  const darkResults = await searchMemory(TEST_ORG, TEST_USER, "dark", { limit: 10 });
  assert.equal(darkResults.length, 1);
  assert.ok(darkResults[0].content.includes("dark mode"));
  const modeResults = await searchMemory(TEST_ORG, TEST_USER, "mode", { limit: 10 });
  assert.equal(modeResults.length, 2);
});

test("deleteMemoryEntry removes entry", async () => {
  const entry = await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "To delete", type: "fact", source: "manual" });
  const deleted = await deleteMemoryEntry(entry.id, TEST_ORG);
  assert.equal(deleted, true);
  const found = await getMemoryEntry(entry.id, TEST_ORG);
  assert.equal(found, null);
  const notDeleted = await deleteMemoryEntry("nonexistent", TEST_ORG);
  assert.equal(notDeleted, false);
});

test("getMemoryStats returns correct counts", async () => {
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "Fact", type: "fact", source: "chat", confidence: 0.9 });
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "Pref", type: "preference", source: "chat", confidence: 0.8 });
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "Device", type: "device", source: "device", confidence: 0.7 });
  const stats = await getMemoryStats(TEST_ORG, TEST_USER);
  assert.equal(stats.totalEntries, 3);
  assert.equal(stats.byType.fact, 1);
  assert.equal(stats.byType.preference, 1);
  assert.equal(stats.byType.device, 1);
  assert.equal(stats.bySource.chat, 2);
  assert.equal(stats.bySource.device, 1);
  assert.ok(stats.avgConfidence! > 0.7 && stats.avgConfidence! < 0.9);
});

test("getRelevantContext returns relevant memories with summary", async () => {
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "User prefers dark mode for coding", type: "preference", source: "chat" });
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "User uses VS Code with dark theme", type: "context", source: "agent" });
  await createMemoryEntry({ organization_id: TEST_ORG, user_id: TEST_USER, content: "User hates light mode", type: "preference", source: "chat" });
  const { entries, summary } = await getRelevantContext(TEST_ORG, TEST_USER, "dark mode", { maxEntries: 5 });
  assert.ok(entries.length >= 2);
  assert.ok(summary.includes("relevant memories"));
});

test("extractAndStoreMemories parses text into sentences", async () => {
  const text = "User prefers dark mode. User uses VS Code. User deploys to AWS.";
  const result = await extractAndStoreMemories(TEST_ORG, TEST_USER, text, "chat", "session-1");
  assert.ok(result.created >= 2);
  const entries = await listMemoryEntries(TEST_ORG, TEST_USER);
  assert.ok(entries.length >= 2);
});

test("agent context CRUD works across fleet", async () => {
  await updateAgentContext(TEST_ORG, "hermes-gateway", "Current load: 42%", { cpu: 0.42 }, "system");
  await updateAgentContext(TEST_ORG, "hermes-gateway", "Current load: 67%", { cpu: 0.67 }, "system");
  await updateAgentContext(TEST_ORG, "hermes-pairing", "Paired devices: 3", { count: 3 }, "system");
  const gatewayCtx = await getAgentContext(TEST_ORG, "hermes-gateway");
  assert.ok(gatewayCtx);
  assert.ok(gatewayCtx!.context.includes("67%"));
  assert.equal(gatewayCtx!.version, 2);
  const all = await listAgentContexts(TEST_ORG);
  assert.equal(all.length, 2);
});