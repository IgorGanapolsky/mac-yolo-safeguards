import test from "node:test";
import assert from "node:assert/strict";

import {
  closeServer,
  createRelayHttpServer,
  listenOnRandomPort,
} from "../src/index.js";

const TOKEN = "test-token";

function message(overrides = {}) {
  return {
    mutation_id: "mut_1",
    author_device_id: "phone_1",
    kind: "user_message",
    payload: { message_id: "msg_1", text: "make money today" },
    ...overrides,
  };
}

async function start(t, options = {}) {
  const relay = createRelayHttpServer({
    tokens: new Map([[TOKEN, "acct_1"]]),
    ...options,
  });
  const baseUrl = await listenOnRandomPort(relay.server);
  t.after(() => closeServer(relay.server));
  return { ...relay, baseUrl };
}

function grant(overrides = {}) {
  return {
    account_id: "acct_1",
    actor_type: "agent",
    actor_id: "agent_1",
    scopes: ["threads:read", "threads:write", "threads:delete"],
    expires_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

async function request(baseUrl, path, { token = TOKEN, body, ...options } = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("requires a valid bearer token before routing", async (t) => {
  const relay = await start(t);
  const { baseUrl } = relay;
  const missing = await request(baseUrl, "/v1/threads/thread_1", { token: null });
  const invalid = await request(baseUrl, "/v1/threads/thread_1", { token: "wrong" });

  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { error: "missing bearer token" });
  assert.equal(invalid.status, 401);
  assert.deepEqual(await invalid.json(), { error: "invalid bearer token" });
  assert.deepEqual(
    relay.getAuthorizationDecisions().map(({ outcome, reason, account_id }) => ({ outcome, reason, account_id })),
    [
      { outcome: "deny", reason: "missing_bearer", account_id: null },
      { outcome: "deny", reason: "invalid_bearer", account_id: null },
    ],
  );
});

test("structured grants enforce actor scopes without exposing bearer tokens", async (t) => {
  const decisions = [];
  const relay = await start(t, {
    tokens: new Map([[TOKEN, grant({ scopes: ["threads:read"] })]]),
    authorizationClock: () => "2026-07-20T12:00:00.000Z",
    onAuthorizationDecision: (decision) => decisions.push(decision),
  });

  const read = await request(relay.baseUrl, "/v1/threads");
  const write = await request(relay.baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message(),
  });

  assert.equal(read.status, 200);
  assert.equal(write.status, 403);
  assert.deepEqual(await write.json(), { error: "missing required scope: threads:write" });
  assert.deepEqual(
    decisions.map(({ outcome, required_scope, actor_type, actor_id }) => ({
      outcome,
      required_scope,
      actor_type,
      actor_id,
    })),
    [
      { outcome: "allow", required_scope: "threads:read", actor_type: "agent", actor_id: "agent_1" },
      { outcome: "deny", required_scope: "threads:write", actor_type: "agent", actor_id: "agent_1" },
    ],
  );
  assert.doesNotMatch(JSON.stringify(decisions), new RegExp(TOKEN));
});

test("delete tombstones require the separate delete scope", async (t) => {
  const { baseUrl } = await start(t, {
    tokens: new Map([[TOKEN, grant({ scopes: ["threads:write"] })]]),
    authorizationClock: () => "2026-07-20T12:00:00.000Z",
  });
  const ordinary = await request(baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message(),
  });
  const deletion = await request(baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message({ mutation_id: "mut_delete", kind: "thread_deleted", payload: {} }),
  });
  assert.equal(ordinary.status, 201);
  assert.equal(deletion.status, 403);
  assert.deepEqual(await deletion.json(), { error: "missing required scope: threads:delete" });
});

test("expired and malformed structured grants fail closed", async (t) => {
  const expired = await start(t, {
    tokens: new Map([[TOKEN, grant({ expires_at: "2026-07-19T00:00:00.000Z" })]]),
    authorizationClock: () => "2026-07-20T12:00:00.000Z",
  });
  assert.equal((await request(expired.baseUrl, "/v1/threads")).status, 401);
  assert.equal(expired.getAuthorizationDecisions()[0].reason, "grant_expired");

  const malformed = await start(t, {
    tokens: new Map([[TOKEN, grant({ actor_type: "robot" })]]),
  });
  assert.equal((await request(malformed.baseUrl, "/v1/threads")).status, 401);
  assert.equal(malformed.getAuthorizationDecisions()[0].reason, "invalid_bearer");
});

test("authorization receipts are bounded copies and telemetry failures are isolated", async (t) => {
  const relay = await start(t, {
    authorizationDecisionLimit: 2,
    onAuthorizationDecision() {
      throw new Error("telemetry unavailable");
    },
  });
  assert.equal((await request(relay.baseUrl, "/v1/threads")).status, 200);
  assert.equal((await request(relay.baseUrl, "/v1/threads/thread_1")).status, 200);
  assert.equal((await request(relay.baseUrl, "/v1/threads/thread_2")).status, 200);
  const decisions = relay.getAuthorizationDecisions();
  assert.equal(decisions.length, 2);
  decisions[0].actor_id = "tampered";
  assert.equal(relay.getAuthorizationDecisions()[0].actor_id, "legacy_bearer");
});

test("authorization decision limits reject unsafe configuration", () => {
  for (const authorizationDecisionLimit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => createRelayHttpServer({ authorizationDecisionLimit }),
      /positive safe integer/,
    );
  }
});

test("reports unknown routes and unsupported methods", async (t) => {
  const { baseUrl } = await start(t);
  assert.equal((await request(baseUrl, "/not-real")).status, 404);
  assert.equal((await request(baseUrl, "/v1/threads/thread_1/events", { method: "DELETE" })).status, 405);
});

test("rejects empty, malformed, oversized, and invalid request bodies", async (t) => {
  const { baseUrl } = await start(t, { maxBodyBytes: 120 });
  const empty = await request(baseUrl, "/v1/threads/thread_1/events", { method: "POST" });
  const malformed = await fetch(`${baseUrl}/v1/threads/thread_1/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: "{broken",
  });
  const oversized = await request(baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message({ payload: { message_id: "msg_1", text: "x".repeat(500) } }),
  });

  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /body is required/);
  assert.equal(malformed.status, 400);
  assert.equal(oversized.status, 400);
  assert.match((await oversized.json()).error, /too large/);
});

test("commits, retries, paginates, projects, and detects conflicts", async (t) => {
  const { baseUrl } = await start(t);
  const created = await request(baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message(),
  });
  const retried = await request(baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message(),
  });
  const conflict = await request(baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message({ payload: { message_id: "msg_1", text: "different" } }),
  });

  assert.equal(created.status, 201);
  assert.equal((await created.json()).created, true);
  assert.equal(retried.status, 200);
  assert.equal((await retried.json()).created, false);
  assert.equal(conflict.status, 409);

  const events = await request(baseUrl, "/v1/threads/thread_1/events?after_seq=0");
  const noNewEvents = await request(baseUrl, "/v1/threads/thread_1/events?after_seq=1");
  const thread = await request(baseUrl, "/v1/threads/thread_1");
  assert.equal(events.status, 200);
  assert.equal((await events.json()).events.length, 1);
  assert.deepEqual(await noNewEvents.json(), { events: [] });
  assert.equal((await thread.json()).thread.messages[0].text, "make money today");

  const threads = await request(baseUrl, "/v1/threads");
  assert.equal(threads.status, 200);
  assert.deepEqual((await threads.json()).threads.map((entry) => entry.thread_id), ["thread_1"]);
});

test("thread listing validates method and tombstone visibility", async (t) => {
  const { baseUrl } = await start(t);
  await request(baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message({ mutation_id: "mut_delete", kind: "thread_deleted", payload: {} }),
  });

  const hidden = await request(baseUrl, "/v1/threads");
  const included = await request(baseUrl, "/v1/threads?include_deleted=1");
  assert.deepEqual(await hidden.json(), { threads: [] });
  assert.equal((await included.json()).threads[0].deleted, true);
  assert.equal((await request(baseUrl, "/v1/threads?include_deleted=yes")).status, 400);
  assert.equal((await request(baseUrl, "/v1/threads", { method: "POST", body: {} })).status, 405);
});

test("rejects malformed and unsafe event cursors", async (t) => {
  const { baseUrl } = await start(t);
  for (const cursor of ["-1", "one", "1.5", "9007199254740992"]) {
    const response = await request(baseUrl, `/v1/threads/thread_1/events?after_seq=${cursor}`);
    assert.equal(response.status, 400);
  }
});

test("returns 410 for writes after a deletion tombstone", async (t) => {
  const { baseUrl } = await start(t);
  const deleted = await request(baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message({ mutation_id: "mut_delete", kind: "thread_deleted", payload: {} }),
  });
  const afterDelete = await request(baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message({ mutation_id: "mut_after" }),
  });

  assert.equal(deleted.status, 201);
  assert.equal(afterDelete.status, 410);
});

test("unexpected server failures are returned without crashing the relay", async (t) => {
  const store = {
    append() {
      throw new Error("database unavailable");
    },
    listEvents() {
      return [];
    },
    getThread() {
      return {};
    },
  };
  const { baseUrl } = await start(t, { store });
  const response = await request(baseUrl, "/v1/threads/thread_1/events", {
    method: "POST",
    body: message(),
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "database unavailable" });
});
