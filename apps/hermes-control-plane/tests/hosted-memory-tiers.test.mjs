import assert from "node:assert/strict";
import test from "node:test";
import {
  appendHistory,
  appendInsight,
  distillFacts,
  renderMemoryFromHistory,
  upsertMemorySection,
} from "../lib/hosted-memory-tiers.ts";

test("distill promotes fact/decided/lock lines without an LLM", () => {
  const history = appendHistory("", "chatted about pricing");
  const next = appendHistory(history, "fact: hosted Hermes is $10/mo");
  const locked = appendHistory(next, "lock: approvals stay in thumbgate.app");
  const facts = distillFacts(locked);
  assert.deepEqual(facts, [
    "fact: hosted Hermes is $10/mo",
    "lock: approvals stay in thumbgate.app",
  ]);
  const memory = renderMemoryFromHistory(locked);
  assert.match(memory, /## facts/);
  assert.match(memory, /\$10\/mo/);
});

test("MEMORY upserts a named section", () => {
  const first = upsertMemorySection("", "facts", "fact: laptop is cache");
  const second = upsertMemorySection(first, "facts", "fact: VPS is source of truth");
  assert.equal(second.includes("laptop is cache"), false);
  assert.match(second, /VPS is source of truth/);
});

test("insights append JSONL rows", () => {
  const row = appendInsight("", { kind: "lock", text: "approvals in thumbgate.app" });
  assert.equal(JSON.parse(row).kind, "lock");
});
