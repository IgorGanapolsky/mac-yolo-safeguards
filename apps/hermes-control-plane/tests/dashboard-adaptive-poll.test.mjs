import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);

// 2026-08-20 Workers quota incident: the 15s foreground poll fetched 6 endpoints
// per tick, so an idle dashboard cost ~35k requests/day/tab and several visible
// dashboards blew the 100k free cap. The poll must be adaptive (fast only while a
// task is in flight) and must NOT use a flat setInterval.
test("poll cadence is adaptive: 15s active, 60s idle", () => {
  assert.match(source, /const ACTIVE_MS = 15000;/);
  assert.match(source, /const IDLE_MS = 60000;/);
  assert.match(source, /activeTasksRef\.current > 0 \? ACTIVE_MS : IDLE_MS/);
});

test("poll self-schedules via setTimeout, not a flat setInterval", () => {
  assert.match(source, /timer = window\.setTimeout\(\(\) => \{ run\(\); schedule\(\); \}, delay\);/);
  assert.doesNotMatch(source, /setInterval\(run, 15000\)/);
});

test("activeTasksRef stays in sync so cadence reflects live task state", () => {
  assert.match(source, /const activeTasksRef = useRef<number>\(0\);/);
  assert.match(source, /activeTasksRef\.current = activeTasks\.length;/);
});

test("hidden tabs still stop polling (visibility gating preserved)", () => {
  assert.match(source, /if \(document\.hidden\) stop\(\);/);
});
