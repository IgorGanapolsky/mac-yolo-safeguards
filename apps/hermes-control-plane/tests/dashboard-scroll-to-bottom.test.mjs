import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("dashboard automatically scrolls conversation history to the bottom on load, refresh, or message update", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
    "utf8"
  );
  assert.match(source, /conversationHistoryRef\s*=\s*useRef<HTMLDivElement/);
  assert.match(source, /scrollConversationToBottom/);
  assert.match(source, /el\.scrollTo\(\{\s*top:\s*el\.scrollHeight/);
  assert.match(source, /<div className="conversation-history" ref=\{conversationHistoryRef\}>/);
});
