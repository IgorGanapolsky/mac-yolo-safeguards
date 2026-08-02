// Contract test: proves the Herdr-parity PRD (docs/HERDR-PARITY-PRD.md) is anchored in
// VERBATIM ThumbGate infra, by asserting key contracts against the real source files.
// Runnable evidence — no Cloudflare D1/SQLite bindings required (reads source as text).
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert");

const ROOT = path.join(__dirname, "..");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const LEASES   = src("apps/hermes-control-plane/lib/task-leases.ts");
const DEMO     = src("apps/hermes-control-plane/app/FailoverPathDemo.tsx");
const DASH     = src("apps/hermes-control-plane/app/dashboard/DashboardClient.tsx");
const CSS      = src("apps/hermes-control-plane/app/globals.css");

test("task-leases: 90s signed lease is a real exported constant", () => {
  assert.match(LEASES, /export const TASK_LEASE_MS = 90_000;/,
    "TASK_LEASE_MS must be 90_000ms (90s), not a magic number elsewhere");
});

test("task-leases: claimTask routes through a signed lease (the safety moat)", () => {
  assert.match(LEASES, /export async function claimTask\(input: \{/, "claimTask exists");
  assert.match(LEASES, /leaseToken: string;/, "claimTask requires a leaseToken (signed lease)");
  assert.match(LEASES, /leaseGeneration: number;/, "claimTask requires leaseGeneration (rejects stale receipts)");
  assert.match(LEASES, /route: "local" \| "cloud";/, "claimTask is local|cloud only (Herdr pane-run is NOT exposed)");
});

test("task-leases: reclassifyStaleLocalTasks encodes Herdr's agent_wait lifecycle map", () => {
  // auto failover -> cloud pending (Herdr 'working' -> cloud continuation)
  assert.match(LEASES, /status = 'cloud_pending'/, "auto: stale local task -> cloud_pending (cloud Continuity)");
  assert.match(LEASES, /route = 'cloud'/, "auto: stale local task -> route cloud");
  // manual failover -> needs_failover/blocked (Herdr 'blocked' -> needs human approval)
  assert.match(LEASES, /status = 'needs_failover'/, "manual: stale local task -> needs_failover (blocked, phone-gated)");
  // only unowned (lease_owner IS NULL) tasks are swept — leased tasks keep running
  assert.match(LEASES, /lease_owner IS NULL/, "only unowned tasks are reclassified (in-flight leases hold)");
});

test("FailoverPathDemo: the 'fenced lease' handoff + stale-receipt rejection contract", () => {
  // phases include the cloud takeover step
  assert.match(DEMO, /"cloud"/, "cloud phase exists (the Continuity takeover)");
  assert.match(DEMO, /"offline_choice"/, "offline_choice phase (pause/ask/auto decision)");
  // the safety contract: stale Mac receipts cannot overwrite a live lease
  assert.match(DEMO, /Stale Mac receipts cannot overwrite/, "stale-receipt rejection is in the demo (L257)");
  assert.match(DEMO, /fenced lease/i, "cloud handoff is described as a fenced lease");
});

test("globals.css: the status enum backs the Herdr idle/working/blocked/done map", () => {
  for (const cls of [".status-running", ".status-cloud_pending", ".status-failed",
                    ".status-offline_blocked", ".status-needs_failover", ".status-completed"]) {
    assert.match(CSS, new RegExp(cls.replace(/\./g, "\\.")), `${cls} status class must exist in globals.css`);
  }
  // map: running/cloud_pending -> working; needs_failover/offline_blocked -> blocked; failed -> unknown; completed -> done
});

test("DashboardClient: the no-device gate that produces 'pair a computer first'", () => {
  assert.match(DASH, /machineDisplayName\(device: Device \| null \| undefined, fallback = "your computer"\)/,
    "machineDisplayName falls back to a phantom 'your computer' label when no device");
  assert.match(DASH, /Auto — \$\{selectedDeviceLabel\} first/, "routeExplain.title uses the (fallback) label");
  assert.match(DASH, /if \(!devices\.length && effectiveRoute !== "cloud"\)/,
    "createTask gates on a paired device (the 'Pair a computer first' wall)");
  assert.match(DASH, /setNotice\("Pair your computer below, or switch target to Continuity \(Cloud VPS\)\."\)/,
    "the exact notice that surfaces as the 'Pair a computer first' button on mobile");
});

test("DashboardClient: cloud route is entitlement-gated (the #1344 dead-end)", () => {
  assert.match(DASH, /hasCloud = Boolean\(organization\?\.cloudAccess\)/,
    "hasCloud derives from the Continuity entitlement (free-tier = false)");
  assert.match(DASH, /routePreference === "cloud" || \(!devices\.length && hasCloud\)/,
    "cloud route is unreachable without hasCloud (free-tier cannot switch target to Continuity)");
});

test("read-only: PRD anchors are present in real source (sanity)", () => {
  // These assert the PRD's claimed anchors exist in the actual repo; they do not
  // execute the Cloudflare Worker runtime (no D1 binding needed).
  assert.match(LEASES, /reclassifyStaleLocalTasks/);
  assert.match(DEMO, /fenced lease/i);
  assert.match(CSS, /status-needs_failover/);
  assert.match(DASH, /machineDisplayName/);
});
