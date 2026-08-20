import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  MIN_DASHBOARD_POLL_INTERVAL_MS,
  resolveDashboardRefresh,
  startDashboardRefresh,
} from "../lib/dashboard-refresh.ts";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);

// 2026-08-19 Cloudflare Workers quota incident: an always-on 5s (later 15s)
// workspace poll cost ~17k requests/day per open tab against the 100k/day cap.
test("workspace poll is off by default — no 5s/15s setInterval", () => {
  assert.doesNotMatch(source, /setInterval\(run, 5000\)/);
  assert.doesNotMatch(source, /setInterval\(run, 15000\)/);
  assert.match(source, /startDashboardRefresh/);
});

test("dashboard refresh helper does not start a sub-60s interval by default", () => {
  const calls = [];
  const handle = startDashboardRefresh({
    run: () => {},
    setIntervalFn: (fn, ms) => {
      calls.push(ms);
      return 1;
    },
  });
  assert.equal(handle.started, false);
  assert.equal(handle.intervalMs, null);
  assert.deepEqual(calls, []);
  assert.equal(resolveDashboardRefresh().enabled, false);
  assert.ok(MIN_DASHBOARD_POLL_INTERVAL_MS >= 15 * 60 * 1000);
  assert.ok(MIN_DASHBOARD_POLL_INTERVAL_MS >= 60_000);
});

test("poll=1 without cursor fails closed", () => {
  const plan = resolveDashboardRefresh({ search: "?poll=1" });
  assert.equal(plan.enabled, false);
  assert.equal(plan.reason, "poll-without-cursor");
  assert.equal(plan.intervalMs, null);
});
