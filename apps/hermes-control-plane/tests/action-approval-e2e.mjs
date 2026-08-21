import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wrangler = new URL("../node_modules/.bin/wrangler", import.meta.url).pathname;
const config = "dist/server/wrangler.json";
const port = 8797;
const persistence = await mkdtemp(join(tmpdir(), "thumbgate-approvals-d1-"));
const runnerSecret = "test-only-runner-signing-secret";
const runnerId = "runner-a";
const sessionToken = "thumbgate-approval-e2e-session";
const otherSessionToken = "thumbgate-other-org-session";
let workerOutput = "";

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Worker did not become ready:\n${workerOutput}`)), 20_000);
    const inspect = (chunk) => {
      workerOutput += chunk.toString();
      if (workerOutput.includes(`Ready on http://localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Worker exited before approval E2E (code ${code}):\n${workerOutput}`));
    });
  });
}

function d1(command, json = false) {
  const result = spawnSync(wrangler, [
    "d1", "execute", "DB", "--local", "--config", config, "--persist-to", persistence,
    ...(json ? ["--json"] : []), "--command", command,
  ], { encoding: "utf8", env: { ...process.env, CI: "1" } });
  assert.equal(result.status, 0, `D1 command failed:\n${result.stdout}\n${result.stderr}`);
  return json ? JSON.parse(result.stdout) : result.stdout;
}

function signature(pathname, body, timestamp, identity = runnerId) {
  const payload = [timestamp, identity, "POST", pathname, body].join("\n");
  return `v1=${createHmac("sha256", runnerSecret).update(payload).digest("base64url")}`;
}

async function runnerPost(pathname, payload, options = {}) {
  const body = options.rawBody ?? JSON.stringify(payload);
  const timestamp = options.timestamp ?? Date.now();
  const identity = options.runnerId ?? runnerId;
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hermes-runner": identity,
      "x-hermes-timestamp": String(timestamp),
      "x-hermes-signature": options.signature ?? signature(pathname, options.signedBody ?? body, timestamp, identity),
    },
    body,
  });
}

function browserHeaders(token) {
  return { cookie: `hermes_session=${token}` };
}

let worker;
try {
  const migration = spawnSync(wrangler, [
    "d1", "migrations", "apply", "DB", "--local", "--config", config, "--persist-to", persistence,
  ], { encoding: "utf8", env: { ...process.env, CI: "1" } });
  assert.equal(migration.status, 0, `D1 migration failed:\n${migration.stdout}\n${migration.stderr}`);
  assert.match(migration.stdout + migration.stderr, /0007_action_approvals\.sql/);

  const now = Date.now();
  const sessionHash = createHash("sha256").update(sessionToken).digest("base64url");
  const otherSessionHash = createHash("sha256").update(otherSessionToken).digest("base64url");
  d1([
    `INSERT INTO users (id, workos_user_id, email, name, created_at, updated_at) VALUES ('approval-user', 'approval-workos-user', 'approval@example.test', 'Approval User', ${now}, ${now})`,
    `INSERT INTO users (id, workos_user_id, email, name, created_at, updated_at) VALUES ('other-user', 'other-workos-user', 'other@example.test', 'Other User', ${now}, ${now})`,
    `INSERT INTO organizations (id, name, plan, created_at, updated_at) VALUES ('approval-org', 'Approval Workspace', 'pro', ${now}, ${now})`,
    `INSERT INTO organizations (id, name, plan, created_at, updated_at) VALUES ('other-org', 'Other Workspace', 'pro', ${now}, ${now})`,
    `INSERT INTO sessions (id_hash, user_id, organization_id, workos_session_id, expires_at, created_at) VALUES ('${sessionHash}', 'approval-user', 'approval-org', 'approval-session', ${now + 600_000}, ${now})`,
    `INSERT INTO sessions (id_hash, user_id, organization_id, workos_session_id, expires_at, created_at) VALUES ('${otherSessionHash}', 'other-user', 'other-org', 'other-session', ${now + 600_000}, ${now})`,
    `INSERT INTO threads (id, organization_id, title, source, created_by_user_id, created_at, updated_at) VALUES ('approval-thread', 'approval-org', 'Approval E2E', 'web', 'approval-user', ${now}, ${now})`,
    `INSERT INTO tasks (id, organization_id, thread_id, prompt, status, route, idempotency_key, lease_owner, lease_token_hash, lease_generation, lease_expires_at, created_by_user_id, created_at, updated_at) VALUES ('approval-task', 'approval-org', 'approval-thread', 'Deploy release', 'running', 'cloud', 'approval-task-idempotency', 'cloud:${runnerId}', 'test-lease-hash', 1, ${now + 600_000}, 'approval-user', ${now}, ${now})`,
  ].join("; "));

  worker = spawn(wrangler, [
    "dev", "--config", config, "--local", "--host", "localhost", "--local-upstream", "localhost",
    "--port", String(port), "--persist-to", persistence, "--show-interactive-dev-session=false",
    "--var", `HERMES_CLOUD_RUNNER_TOKEN:${runnerSecret}`,
  ], { env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  await waitForReady(worker);

  const rawArguments = "deploy --token production-secret-value";
  const argumentDigest = createHash("sha256").update(rawArguments).digest("base64url");
  const requestPayload = {
    taskId: "approval-task",
    idempotencyKey: "approval-task:deploy-1",
    actionClass: "production",
    summary: "Deploy verified release to production",
    argumentDigest,
    ttlMs: 120_000,
  };
  const created = await runnerPost("/api/runner/approvals", requestPayload);
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  const approvalId = createdBody.approval.id;
  assert.equal(createdBody.approval.status, "pending");
  assert.equal(JSON.stringify(createdBody).includes(rawArguments), false);

  const replay = await runnerPost("/api/runner/approvals", requestPayload);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).approval.id, approvalId);

  const tampered = await runnerPost("/api/runner/approvals", { ...requestPayload, summary: "Deploy another release" }, { signedBody: JSON.stringify(requestPayload) });
  assert.equal(tampered.status, 401);
  const stale = await runnerPost("/api/runner/approvals/poll", { approvalId }, { timestamp: Date.now() - 300_001 });
  assert.equal(stale.status, 401);
  const malformed = await runnerPost("/api/runner/approvals", null, { rawBody: "{" });
  assert.equal(malformed.status, 400);

  assert.equal((await fetch(`http://127.0.0.1:${port}/api/approvals`)).status, 401);
  const otherInbox = await fetch(`http://127.0.0.1:${port}/api/approvals`, { headers: browserHeaders(otherSessionToken) });
  assert.deepEqual(await otherInbox.json(), { pendingCount: 0, approvals: [] });
  const inbox = await fetch(`http://127.0.0.1:${port}/api/approvals`, { headers: browserHeaders(sessionToken) });
  const inboxBody = await inbox.json();
  assert.equal(inboxBody.pendingCount, 1);
  assert.equal(inboxBody.approvals[0].id, approvalId);
  assert.equal(JSON.stringify(inboxBody).includes(rawArguments), false);

  const dashboard = await fetch(`http://127.0.0.1:${port}/dashboard`, { headers: browserHeaders(sessionToken) });
  const dashboardHtml = await dashboard.text();
  assert.equal(dashboard.status, 200);
  assert.match(dashboardHtml, /Approvals/);
  assert.match(dashboardHtml, /1 pending/);
  const approvalPage = await fetch(`http://127.0.0.1:${port}/dashboard/approvals`, { headers: browserHeaders(sessionToken) });
  const approvalHtml = await approvalPage.text();
  assert.equal(approvalPage.status, 200);
  assert.match(approvalHtml, /Action approvals/);
  assert.match(approvalHtml, /Deploy verified release to production/);
  assert.doesNotMatch(approvalHtml, /production-secret-value/);

  const runnerCannotDecide = await runnerPost(`/api/approvals/${approvalId}/decision`, { decision: "approved" });
  assert.equal(runnerCannotDecide.status, 401);
  const approved = await fetch(`http://127.0.0.1:${port}/api/approvals/${approvalId}/decision`, {
    method: "POST",
    headers: { ...browserHeaders(sessionToken), "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved" }),
  });
  const approvedText = await approved.text();
  assert.equal(approved.status, 200, `${approvedText}\n${workerOutput.slice(-5_000)}`);
  assert.equal(JSON.parse(approvedText).approval.status, "approved");
  const duplicateDecision = await fetch(`http://127.0.0.1:${port}/api/approvals/${approvalId}/decision`, {
    method: "POST",
    headers: { ...browserHeaders(sessionToken), "content-type": "application/json" },
    body: JSON.stringify({ decision: "denied" }),
  });
  assert.equal(duplicateDecision.status, 409);

  const polled = await runnerPost("/api/runner/approvals/poll", { approvalId });
  assert.equal((await polled.json()).approval.status, "approved");
  const consumed = await runnerPost(`/api/runner/approvals/${approvalId}/consume`, {});
  assert.equal(consumed.status, 200);
  assert.equal((await consumed.json()).approval.status, "consumed");
  assert.equal((await runnerPost(`/api/runner/approvals/${approvalId}/consume`, {})).status, 409);

  const auditRows = d1("SELECT action, actor_type AS actorType FROM audit_events WHERE target_id = '" + approvalId + "' ORDER BY created_at", true);
  assert.deepEqual(auditRows[0].results.map((row) => [row.action, row.actorType]), [
    ["approval.requested", "runner"],
    ["approval.approved", "user"],
    ["approval.consumed", "runner"],
  ]);
  console.log("action approval E2E passed: signed runner boundary, tenant isolation, atomic decision/consume, audit, and dashboard UI");
} finally {
  if (worker) {
    const exited = worker.exitCode === null
      ? new Promise((resolve) => worker.once("exit", resolve))
      : Promise.resolve();
    worker.kill("SIGTERM");
    await exited;
  }
  await rm(persistence, { recursive: true, force: true });
}
