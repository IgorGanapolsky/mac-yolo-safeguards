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
test("workspace poll is 15s, not the old 5s", () => {
  assert.match(source, /setInterval\(run, 15000\)/);
  assert.doesNotMatch(source, /setInterval\(run, 5000\)/);
});

test("workspace poll pauses in hidden tabs and resumes on foreground", () => {
  assert.match(source, /visibilitychange/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /removeEventListener\("visibilitychange"/);
});
