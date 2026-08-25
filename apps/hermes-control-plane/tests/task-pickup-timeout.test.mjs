import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  staleUnclaimedTaskIds,
  queuedSince,
  TASK_PICKUP_TIMEOUT_MS,
  TASK_PICKUP_TIMEOUT_ERROR,
} from "../lib/task-pickup.ts";

const tasksRoute = readFileSync(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
const taskLeases = readFileSync(new URL("../lib/task-leases.ts", import.meta.url), "utf8");
const taskPickup = readFileSync(new URL("../lib/task-pickup.ts", import.meta.url), "utf8");

const NOW = 1_700_000_000_000;
const old = (ms) => NOW - ms;

test("a task queued past the pickup timeout is selected for expiry", () => {
  const rows = [{ id: "stuck", status: "cloud_pending", createdAt: old(TASK_PICKUP_TIMEOUT_MS + 1000) }];
  assert.deepEqual(staleUnclaimedTaskIds(rows, NOW), ["stuck"]);
});

test("the 26-hour CLOUD PENDING task from the live dashboard is caught", () => {
  const rows = [{ id: "real", status: "cloud_pending", createdAt: old(26 * 60 * 60 * 1000) }];
  assert.deepEqual(staleUnclaimedTaskIds(rows, NOW), ["real"]);
});

test("a freshly queued task is left alone", () => {
  const rows = [{ id: "fresh", status: "cloud_pending", createdAt: old(5_000) }];
  assert.deepEqual(staleUnclaimedTaskIds(rows, NOW), []);
});

test("a task just inside the timeout is left alone", () => {
  const rows = [{ id: "edge", status: "cloud_pending", createdAt: old(TASK_PICKUP_TIMEOUT_MS - 1) }];
  assert.deepEqual(staleUnclaimedTaskIds(rows, NOW), []);
});

test("local_pending is swept too, but running and terminal states never are", () => {
  const rows = [
    { id: "local", status: "local_pending", createdAt: old(TASK_PICKUP_TIMEOUT_MS * 2) },
    { id: "running", status: "running", createdAt: old(TASK_PICKUP_TIMEOUT_MS * 2) },
    { id: "done", status: "completed", createdAt: old(TASK_PICKUP_TIMEOUT_MS * 2) },
    { id: "dead", status: "failed", createdAt: old(TASK_PICKUP_TIMEOUT_MS * 2) },
  ];
  assert.deepEqual(staleUnclaimedTaskIds(rows, NOW), ["local"]);
});

test("needs_failover is never auto-expired: it is an intentional wait for a human", () => {
  const rows = [{ id: "await-human", status: "needs_failover", createdAt: old(TASK_PICKUP_TIMEOUT_MS * 10) }];
  assert.deepEqual(staleUnclaimedTaskIds(rows, NOW), []);
});

test("a running task is never stolen even if it is very old", () => {
  // Lease renewal owns liveness for claimed tasks; the reaper must not race it.
  const rows = [{ id: "long-run", status: "running", createdAt: old(48 * 60 * 60 * 1000) }];
  assert.deepEqual(staleUnclaimedTaskIds(rows, NOW), []);
});

test("the expiry write is fenced to unclaimed rows only", () => {
  assert.match(taskLeases, /status IN \('cloud_pending', 'local_pending'\)/);
  assert.match(taskLeases, /lease_owner IS NULL/);
  assert.match(taskLeases, /lease_expires_at IS NULL/);
});

test("expiry issues no write when nothing is stale", () => {
  assert.match(taskLeases, /if \(!taskIds\.length\) return \[\];/);
});

test("the dashboard read path expires stale tasks and reports the reason", () => {
  assert.match(tasksRoute, /staleUnclaimedTaskIds/);
  assert.match(tasksRoute, /expireUnclaimedTasks/);
  assert.match(tasksRoute, /TASK_PICKUP_TIMEOUT_ERROR/);
});

test("the timeout error tells the user what happened and what to do", () => {
  assert.match(TASK_PICKUP_TIMEOUT_ERROR, /15 minutes/);
  assert.match(TASK_PICKUP_TIMEOUT_ERROR, /send it again/);
});

// --- the timeout is measured from the latest queue transition, not creation ---

test("a freshly requeued task is not cancelled for being old", () => {
  // POST /api/tasks/failover moves an old needs_failover row to cloud_pending
  // and refreshes updated_at. Judging it by created_at would cancel a failover
  // the operator approved seconds ago.
  const rows = [{
    id: "just-failed-over",
    status: "cloud_pending",
    createdAt: old(26 * 60 * 60 * 1000),
    updatedAt: old(5_000),
  }];
  assert.deepEqual(staleUnclaimedTaskIds(rows, NOW), []);
});

test("a device-heartbeat requeue also restarts the clock", () => {
  const rows = [{
    id: "requeued",
    status: "local_pending",
    createdAt: old(48 * 60 * 60 * 1000),
    updatedAt: old(TASK_PICKUP_TIMEOUT_MS - 1),
  }];
  assert.deepEqual(staleUnclaimedTaskIds(rows, NOW), []);
});

test("a task whose last transition is past the timeout still expires", () => {
  const rows = [{
    id: "abandoned",
    status: "cloud_pending",
    createdAt: old(26 * 60 * 60 * 1000),
    updatedAt: old(TASK_PICKUP_TIMEOUT_MS + 1000),
  }];
  assert.deepEqual(staleUnclaimedTaskIds(rows, NOW), ["abandoned"]);
});

test("queuedSince falls back to created_at when updated_at is absent", () => {
  assert.equal(queuedSince({ id: "a", status: "cloud_pending", createdAt: 5 }), 5);
  assert.equal(queuedSince({ id: "a", status: "cloud_pending", createdAt: 5, updatedAt: null }), 5);
  assert.equal(queuedSince({ id: "a", status: "cloud_pending", createdAt: 5, updatedAt: 0 }), 5);
  assert.equal(queuedSince({ id: "a", status: "cloud_pending", createdAt: 5, updatedAt: 9 }), 9);
});

test("the expiry write fences on the latest transition, not creation", () => {
  assert.match(taskLeases, /COALESCE\(updated_at, created_at\) <= \?/);
});

// --- the cutoff no longer depends on a dashboard read ---

test("the claim path refuses a task queued past the pickup timeout", () => {
  // Otherwise a runner recovering hours later executes a task that should
  // already have been cancelled, regardless of whether anyone opened /d.
  assert.match(taskLeases, /k\.status = 'running' OR COALESCE\(k\.updated_at, k\.created_at\) > \?/);
  assert.match(taskLeases, /status = 'running' OR COALESCE\(updated_at, created_at\) > \?/);
});

test("admission does not count abandoned rows against the concurrent-task cap", () => {
  assert.match(tasksRoute, /AND NOT \(status IN \('cloud_pending', 'local_pending'\)/);
  assert.match(tasksRoute, /AS activeTasks/);
});

// --- a raced candidate is never reported as failed ---

test("expiry reports the rows it actually changed, not the candidate list", () => {
  assert.match(taskLeases, /Promise<string\[\]>/);
  assert.match(taskLeases, /SELECT id FROM tasks/);
  assert.doesNotMatch(tasksRoute, /if \(expired > 0\)/);
  assert.match(tasksRoute, /const expiredIds = new Set\(await expireUnclaimedTasks\(staleIds, now\)\);/);
  assert.match(tasksRoute, /if \(!expiredIds\.has\(task\.id\)\) continue;/);
});
