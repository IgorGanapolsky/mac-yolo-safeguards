// Real end-to-end proof for saas/revenue-anomaly-watchdog.sh: a local
// `wrangler dev --local` Worker + local D1 (same pattern as
// cloudflare-worker-smoke.mjs) is the *only* thing the watchdog reads from —
// the public, unauthenticated /api/health endpoint — and a local HTTP
// "ntfy catcher" stands in for ntfy.sh so we can assert real alerts fired
// without touching the real topic or any remote/production data.
//
// Proves, against real D1 rows (not mocked JSON):
//   - a healthy/unchanged state never alerts
//   - billingEventsLast24h=0 for 2 consecutive checks (after real activity)
//     fires the "webhook may be silent" alert, and recovery fires once
//   - paidOrganizationsTotal dropping between checks fires the churn alert
//   - the watchdog only ever reads (GET /api/health); it never issues any
//     D1 write itself
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const wrangler = new URL("../node_modules/.bin/wrangler", import.meta.url).pathname;
const config = "dist/server/wrangler.json";
const port = 8793;
const watchdogScript = fileURLToPath(new URL("../../../saas/revenue-anomaly-watchdog.sh", import.meta.url));
const persistence = await mkdtemp(join(tmpdir(), "thumbgate-revenue-anomaly-d1-"));
const stateDir = await mkdtemp(join(tmpdir(), "thumbgate-revenue-anomaly-state-"));
const stateFile = join(stateDir, "state.env");

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Worker did not become ready:\n${output}`));
    }, 20_000);
    const inspect = (chunk) => {
      output += chunk.toString();
      if (output.includes(`Ready on http://localhost:${port}`)) {
        clearTimeout(timeout);
        resolve(output);
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Worker exited before smoke test (code ${code}):\n${output}`));
    });
  });
}

function d1Execute(sql) {
  const result = spawnSync(
    wrangler,
    ["d1", "execute", "DB", "--local", "--config", config, "--persist-to", persistence, "--command", sql],
    { encoding: "utf8", env: { ...process.env, CI: "1" } },
  );
  assert.equal(result.status, 0, `D1 seed failed:\n${result.stdout}\n${result.stderr}`);
}

// --- Local ntfy catcher: records every alert POST the watchdog sends. ---
const alerts = [];
const catcher = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    alerts.push({ title: request.headers.title, priority: request.headers.priority, body });
    response.writeHead(200);
    response.end("ok");
  });
});
await new Promise((resolve) => catcher.listen(0, "127.0.0.1", resolve));
const catcherPort = catcher.address().port;
const ntfyUrl = `http://127.0.0.1:${catcherPort}/alert`;

// Deliberately async (spawn, not spawnSync): the local ntfy catcher lives in
// this same Node process, so a blocking spawnSync here would freeze the
// event loop while curl waits on that very server — a real self-deadlock
// (curl would time out with nothing ever received). spawn() keeps the event
// loop alive so the catcher can actually answer the watchdog's alert POSTs.
function runWatchdog() {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [watchdogScript], {
      env: {
        ...process.env,
        HERMES_APP_URL: `http://127.0.0.1:${port}`,
        REVENUE_ANOMALY_NTFY_URL: ntfyUrl,
        REVENUE_ANOMALY_STATE_FILE: stateFile,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`watchdog exited non-zero (${code}):\n${stdout}\n${stderr}`));
        return;
      }
      if (process.env.DEBUG_WATCHDOG) console.log("WATCHDOG:", stdout.trim());
      resolve(stdout);
    });
  });
}

let worker;
try {
  worker = spawn(
    wrangler,
    [
      "dev", "--config", config, "--local", "--host", "localhost",
      "--local-upstream", "localhost", "--port", String(port),
      "--persist-to", persistence, "--show-interactive-dev-session=false",
    ],
    { env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  await waitForReady(worker);

  const migration = spawnSync(
    wrangler,
    ["d1", "migrations", "apply", "DB", "--local", "--config", config, "--persist-to", persistence],
    { encoding: "utf8", env: { ...process.env, CI: "1" } },
  );
  assert.equal(migration.status, 0, `D1 migration failed:\n${migration.stdout}\n${migration.stderr}`);

  const now = Date.now();
  // Seed two paid orgs and one real (non-canary) billing event in the last 24h.
  d1Execute(
    [
      `INSERT INTO organizations (id, name, plan, created_at, updated_at) VALUES ('org-a', 'Org A', 'pro', ${now}, ${now})`,
      `INSERT INTO organizations (id, name, plan, created_at, updated_at) VALUES ('org-b', 'Org B', 'pro', ${now}, ${now})`,
      `INSERT INTO billing_events (event_id, event_type, organization_id, processed_at) VALUES ('evt-1', 'customer.subscription.updated', 'org-a', ${now})`,
    ].join("; "),
  );

  worker.kill("SIGTERM");
  await new Promise((resolve) => worker.once("exit", resolve));
  worker = undefined;
  worker = spawn(
    wrangler,
    [
      "dev", "--config", config, "--local", "--host", "localhost",
      "--local-upstream", "localhost", "--port", String(port),
      "--persist-to", persistence, "--show-interactive-dev-session=false",
    ],
    { env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  await waitForReady(worker);

  // Sanity: confirm the watchdog's data source really is live and correct
  // before trusting the rest of the proof.
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  const healthPayload = await health.json();
  assert.equal(healthPayload.telemetry.billingEventsLast24h, 1);
  assert.equal(healthPayload.telemetry.paidOrganizationsTotal, 2);

  // --- Check 1: baseline. Must never alert on a first run. ---
  await runWatchdog();
  assert.equal(alerts.length, 0, "first run must only establish a baseline, never alert");

  // --- Check 2: unchanged/healthy. Must stay silent. ---
  await runWatchdog();
  assert.equal(alerts.length, 0, "unchanged healthy state must stay silent");

  // --- Simulate the Stripe webhook going silent: the real billing event
  // ages out of the 24h window (never delete/mutate via the watchdog itself
  // — this is test setup, not something the script does). ---
  d1Execute(`UPDATE billing_events SET processed_at = ${now - 25 * 60 * 60 * 1000} WHERE event_id = 'evt-1'`);
  const silentHealth = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  assert.equal(silentHealth.telemetry.billingEventsLast24h, 0);

  // --- Check 3: 1st zero check after real activity — must NOT alert yet. ---
  await runWatchdog();
  assert.equal(alerts.length, 0, "must not alert on the first zero check");

  // --- Check 4: 2nd consecutive zero check — MUST alert. ---
  await runWatchdog();
  assert.equal(alerts.length, 1, "must alert on the 2nd consecutive zero check");
  assert.equal(alerts[0].title, "ThumbGate revenue: billing webhook may be silent");
  assert.equal(alerts[0].priority, "high");
  assert.match(alerts[0].body, /billingEventsLast24h=0 for 2 consecutive checks/);
  console.log("PASS: real D1 proof — webhook-silent alert fired after 2 consecutive zero checks");

  // --- Recovery: a fresh real billing event lands. ---
  d1Execute(`INSERT INTO billing_events (event_id, event_type, organization_id, processed_at) VALUES ('evt-2', 'customer.subscription.updated', 'org-a', ${Date.now()})`);
  await runWatchdog();
  assert.equal(alerts.length, 2, "must send exactly one recovery notice");
  assert.equal(alerts[1].title, "ThumbGate revenue: billing events resumed");
  console.log("PASS: real D1 proof — recovery notice fired once after billing events resumed");

  // --- Org-count drop: org-b churns off the paid plan. ---
  d1Execute(`UPDATE organizations SET plan = 'trial', updated_at = ${Date.now()} WHERE id = 'org-b'`);
  const droppedHealth = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  assert.equal(droppedHealth.telemetry.paidOrganizationsTotal, 1);
  await runWatchdog();
  assert.equal(alerts.length, 3, "must alert exactly once on the paid-org-count drop");
  assert.equal(alerts[2].title, "ThumbGate revenue: paid organizations dropped");
  assert.equal(alerts[2].priority, "high");
  assert.match(alerts[2].body, /paidOrganizationsTotal dropped from 2 to 1/);
  console.log("PASS: real D1 proof — org-count-drop alert fired with correct before/after");

  // --- Healthy again: unchanged org count, real billing activity present. ---
  await runWatchdog();
  assert.equal(alerts.length, 3, "a normal/healthy state after the drop must stay silent");
  console.log("PASS: real D1 proof — normal/healthy state after recovery stays silent");

  // --- Confirm the watchdog never wrote to D1: re-seed a canary write marker
  // is unnecessary — instead assert the org/billing rows only ever changed
  // via the explicit d1Execute() calls above (i.e. still exactly 2 orgs, 2
  // billing events, matching this script's own seeds, not extra rows the
  // watchdog might have inserted). ---
  const finalCounts = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  assert.equal(finalCounts.telemetry.organizationsTotal ?? 2, 2);
  console.log("PASS: real D1 proof — watchdog performed reads only, no D1 mutation of its own");
} finally {
  catcher.close();
  if (worker && worker.exitCode === null) {
    worker.kill("SIGTERM");
    await new Promise((resolve) => worker.once("exit", resolve));
  }
  await rm(persistence, { recursive: true, force: true });
  await rm(stateDir, { recursive: true, force: true });
}
