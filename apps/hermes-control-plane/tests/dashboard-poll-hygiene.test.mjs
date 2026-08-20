import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  MIN_DASHBOARD_POLL_INTERVAL_MS,
  ERROR_RETRY_DELAY_MS,
  resolveDashboardRefresh,
  startDashboardRefresh,
  scheduleOneShotErrorRetry,
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

test("explicit Refresh/Retry control calls loadWorkspace once — no interval", () => {
  assert.match(source, /requestWorkspaceRefresh/);
  assert.match(source, /data-testid="dashboard-refresh"/);
  assert.match(source, /data-testid="dashboard-retry"/);
  assert.doesNotMatch(source, /setInterval\(/);
});

test("error retry is one 30s timeout, never a sub-60s loop", () => {
  const timeouts = [];
  const intervals = [];
  const handle = scheduleOneShotErrorRetry({
    run: () => {},
    setTimeoutFn: (fn, ms) => {
      timeouts.push(ms);
      return 1;
    },
  });
  assert.equal(handle.started, true);
  assert.equal(handle.delayMs, 30_000);
  assert.equal(ERROR_RETRY_DELAY_MS, 30_000);
  assert.deepEqual(timeouts, [30_000]);
  assert.deepEqual(intervals, []);
  assert.match(source, /scheduleOneShotErrorRetry/);
  assert.match(source, /errorRetryUsedRef/);
});
