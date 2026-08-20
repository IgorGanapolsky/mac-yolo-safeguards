import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);

// 2026-08-19 Cloudflare Workers quota incident: an always-on 5s workspace poll
// cost ~17k requests/day per open tab against the 100k/day free-tier cap.
test("workspace poll is adaptive (60s idle / 15s active), never a flat interval", () => {
  // 2026-08-20: loadWorkspace fetches 6 endpoints per tick; a flat 15s interval
  // still cost ~35k req/day per visible tab. Now self-scheduling + adaptive.
  assert.match(source, /const IDLE_MS = 60000;/);
  assert.match(source, /const ACTIVE_MS = 15000;/);
  assert.doesNotMatch(source, /setInterval\(run, 5000\)/);
  assert.doesNotMatch(source, /setInterval\(run, 15000\)/);
});

test("workspace poll pauses in hidden tabs and resumes on foreground", () => {
  assert.match(source, /visibilitychange/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /removeEventListener\("visibilitychange"/);
});
