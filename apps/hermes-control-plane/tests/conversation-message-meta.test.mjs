import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);

test("thread console renders status and time metadata for snapshots and task exchanges", () => {
  assert.match(source, /snapshotMessageMeta\(message, threadDetails\.syncedAt\)/);
  assert.match(source, /taskPromptMeta\(task\)/);
  assert.match(source, /taskOutputMeta\(task\)/);
  assert.match(source, /data-testid="conversation-message-meta"/);
  assert.match(source, /timestampSource === "sync" \? "Synced " : ""/);
});

test("thread detail keeps the API sync timestamp and task completion timestamp", () => {
  assert.match(source, /syncedAt: body\.thread\?\.syncedAt \?\? null/);
  assert.match(source, /completedAt\?: number \| null/);
});
