#!/usr/bin/env node
/**
 * ThumbGate cache harness. Laptop is cache, VPS is source of truth.
 * Approvals stay in thumbgate.app.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const historyPath = join(root, "memory", "HISTORY.md");
const memoryPath = join(root, "memory", "MEMORY.md");
const insightsPath = join(root, "global", "insights.jsonl");

function ensureLayout() {
  mkdirSync(join(root, "memory"), { recursive: true });
  mkdirSync(join(root, "global"), { recursive: true });
  if (!existsSync(historyPath)) writeFileSync(historyPath, "");
  if (!existsSync(memoryPath)) writeFileSync(memoryPath, "## facts\n");
  if (!existsSync(insightsPath)) writeFileSync(insightsPath, "");
}

export function persistBeforeLive(input = {}) {
  const persistedId = String(input.persistedId ?? "").trim();
  if (String(input.runtime ?? "").toLowerCase() !== "vps" && String(input.runtime ?? "").toLowerCase() !== "cloud") {
    return { ok: false, live: false, reason: "laptop_is_cache" };
  }
  if (!persistedId) return { ok: false, live: false, reason: "not_persisted" };
  return { ok: true, live: true, persistedId };
}

export function snippetHash(text) {
  let hash = 0xcbf29ce484222325n;
  const value = String(text ?? "");
  for (let i = 0; i < value.length; i += 1) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function hashAnchorReplace(input = {}) {
  const content = String(input.content ?? "");
  const before = String(input.before ?? "");
  const after = String(input.after ?? "");
  if (!before) return { ok: false, reason: "missing_span" };
  const hash = snippetHash(before);
  if (input.expectedHash && input.expectedHash !== hash) return { ok: false, reason: "hash_mismatch" };
  const parts = content.split(before);
  if (parts.length < 2) return { ok: false, reason: "not_found" };
  if (parts.length > 2) return { ok: false, reason: "ambiguous" };
  return { ok: true, content: `${parts[0]}${after}${parts[1]}`, hash };
}

const LOCAL_ONLY = [
  { id: "vscode_extension", re: /\b(code\s+--install-extension|vsce\s+package)\b/i },
];

export function evaluateToolPolicy(prompt) {
  const text = String(prompt ?? "");
  for (const pattern of LOCAL_ONLY) {
    if (pattern.re.test(text)) {
      return { allowed: false, matched: pattern.id, message: "vscode_extension is local-only" };
    }
  }
  return { allowed: true };
}

function distill(history) {
  return String(history ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(fact|decided|lock):\s+/i.test(line));
}

function main() {
  ensureLayout();
  const seed = "fact: laptop is cache, VPS is source of truth\nlock: approvals stay in thumbgate.app\n";
  writeFileSync(historyPath, seed);
  const facts = distill(seed);
  writeFileSync(memoryPath, `## facts\n${facts.join("\n")}\n`);
  writeFileSync(insightsPath, `${JSON.stringify({ kind: "lock", text: "approvals stay in thumbgate.app" })}\n`);
  console.log("laptop is cache, VPS is source of truth");
  console.log(JSON.stringify({
    history: historyPath,
    memory: memoryPath,
    insights: insightsPath,
    persist: persistBeforeLive({ runtime: "vps", persistedId: "local-cache" }),
    vscode: evaluateToolPolicy("code --install-extension example"),
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
