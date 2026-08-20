import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const client = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);
const helper = fs.readFileSync(
  path.join(import.meta.dirname, "../lib/conversation-send-visibility.ts"),
  "utf8",
);

// 2026-08-20: Enter/send cleared the composer and updated the task card, but the
// conversation-history bubble store was never patched — the prompt looked gone.
test("createTask optimistically patches conversation-history tasks", () => {
  assert.match(client, /setThreadDetails/);
  assert.match(client, /mergeConversationTasks/);
  assert.match(client, /pendingConversationTasksRef/);
  assert.match(client, /scrollConversationHistoryToLatest/);
});

test("user prompt bubbles are tagged for scroll-into-view", () => {
  assert.match(client, /data-testid="conversation-user-prompt"/);
  assert.match(client, /task\.prompt\.trim\(\)/);
});

test("visibility helper keeps optimistic rows until the server catches up", () => {
  assert.match(helper, /export function mergeConversationTasks/);
  assert.match(helper, /export function pruneResolvedOptimistic/);
  assert.match(helper, /export function scrollConversationHistoryToLatest/);
  assert.match(helper, /\.conversation-history/);
});
