import assert from "node:assert/strict";
import test from "node:test";

import {
  closeServer as closeRelay,
  createRelayHttpServer,
  listenOnRandomPort as listenRelay,
} from "../../../packages/hermes-protocol/src/index.js";
import {
  closeServer,
  createDashboardServer,
  listenOnRandomPort,
} from "../src/dashboard-server.js";

const RELAY_TOKEN = "relay-secret-never-sent-to-browser";
const ACCESS_CODE = "browser-access-code";
const ACCOUNT_ID = "acct_dashboard";

function mutation(kind, payload, id = crypto.randomUUID()) {
  return { mutation_id: `mut_${id}`, author_device_id: "phone_1", kind, payload };
}

async function start(t, { now } = {}) {
  const relay = createRelayHttpServer({ tokens: new Map([[RELAY_TOKEN, ACCOUNT_ID]]) });
  const relayBaseUrl = await listenRelay(relay.server);
  const dashboard = createDashboardServer({
    relayBaseUrl,
    relayToken: RELAY_TOKEN,
    accountId: ACCOUNT_ID,
    accessCode: ACCESS_CODE,
    secureCookies: false,
    sessionTtlMs: 1_000,
    now,
  });
  const baseUrl = await listenOnRandomPort(dashboard.server);
  t.after(async () => {
    await closeServer(dashboard.server);
    if (relay.server.listening) {
      await closeRelay(relay.server);
    }
  });
  return { ...dashboard, baseUrl, relay, relayBaseUrl };
}

async function login(baseUrl, code = ACCESS_CODE, origin = baseUrl) {
  const response = await fetch(`${baseUrl}/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ access_code: code }),
  });
  const body = await response.json();
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { response, body, cookie };
}

async function api(baseUrl, path, { cookie, csrf, body, method = "GET", origin = baseUrl } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (csrf) headers["x-hermes-csrf"] = csrf;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function appendRelay(relayBaseUrl, threadId, event) {
  return fetch(`${relayBaseUrl}/v1/threads/${threadId}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${RELAY_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}

test("requires all secrets and connection settings", () => {
  assert.throws(() => createDashboardServer(), /required/);
});

test("serves the app with browser protections and never embeds the relay token", async (t) => {
  const { baseUrl } = await start(t);
  const response = await fetch(baseUrl);
  const html = await response.text();
  const script = await (await fetch(`${baseUrl}/app.js`)).text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.doesNotMatch(`${html}${script}`, new RegExp(RELAY_TOKEN));
  assert.equal((await fetch(`${baseUrl}/missing`)).status, 404);
  assert.equal((await fetch(baseUrl, { method: "POST" })).status, 405);
});

test("login is same-origin, constant-shape, expiring, and logout revokes it", async (t) => {
  let currentTime = 1_000;
  const { baseUrl } = await start(t, { now: () => currentTime });
  assert.equal((await login(baseUrl, ACCESS_CODE, "https://attacker.invalid")).response.status, 403);
  assert.equal((await login(baseUrl, "wrong")).response.status, 401);

  const signedIn = await login(baseUrl);
  assert.equal(signedIn.response.status, 201);
  assert.match(signedIn.response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(signedIn.response.headers.get("set-cookie"), /SameSite=Strict/);
  assert.doesNotMatch(signedIn.response.headers.get("set-cookie"), /Secure/);
  assert.notEqual(signedIn.cookie.split("=")[1], RELAY_TOKEN);
  assert.equal((await api(baseUrl, "/api/session", { cookie: signedIn.cookie })).status, 200);

  const badCsrf = await api(baseUrl, "/api/logout", { method: "POST", cookie: signedIn.cookie, csrf: "wrong", body: {} });
  assert.equal(badCsrf.status, 403);
  const logout = await api(baseUrl, "/api/logout", { method: "POST", cookie: signedIn.cookie, csrf: signedIn.body.csrf_token, body: {} });
  assert.equal(logout.status, 200);
  assert.equal((await api(baseUrl, "/api/session", { cookie: signedIn.cookie })).status, 401);

  const expiring = await login(baseUrl);
  currentTime = 2_001;
  assert.equal((await api(baseUrl, "/api/session", { cookie: expiring.cookie })).status, 401);
});

test("phone and web share ordered, idempotent, account-scoped thread state", async (t) => {
  const { baseUrl, relayBaseUrl } = await start(t);
  await appendRelay(relayBaseUrl, "thread_shared", mutation("thread_title_set", { title: "Revenue plan" }, "title"));
  await appendRelay(relayBaseUrl, "thread_shared", mutation("user_message", { message_id: "phone_msg", text: "make money today" }, "phone"));

  const signedIn = await login(baseUrl);
  const auth = { cookie: signedIn.cookie, csrf: signedIn.body.csrf_token };
  const list = await api(baseUrl, "/api/threads", auth);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).threads.map((thread) => thread.thread_id), ["thread_shared"]);

  const webMutation = mutation("user_message", { message_id: "web_msg", text: "Continue from web" }, "web");
  const first = await api(baseUrl, "/api/threads/thread_shared/events", { ...auth, method: "POST", body: webMutation });
  const retry = await api(baseUrl, "/api/threads/thread_shared/events", { ...auth, method: "POST", body: webMutation });
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).created, false);

  const phoneRead = await fetch(`${relayBaseUrl}/v1/threads/thread_shared`, {
    headers: { authorization: `Bearer ${RELAY_TOKEN}` },
  });
  assert.deepEqual((await phoneRead.json()).thread.messages.map((message) => message.text), [
    "make money today",
    "Continue from web",
  ]);

  const deleted = await api(baseUrl, "/api/threads/thread_shared/events", {
    ...auth,
    method: "POST",
    body: mutation("thread_deleted", { reason: "web_user_request" }, "delete"),
  });
  assert.equal(deleted.status, 201);
  assert.deepEqual(await (await api(baseUrl, "/api/threads", auth)).json(), { threads: [] });

  const wrongAccount = await fetch(`${relayBaseUrl}/v1/threads/thread_shared`, {
    headers: { authorization: "Bearer unknown" },
  });
  assert.equal(wrongAccount.status, 401);
});

test("rejects unauthenticated, malformed, cross-origin, and oversized API requests", async (t) => {
  const { baseUrl } = await start(t);
  assert.equal((await api(baseUrl, "/api/threads")).status, 401);
  const signedIn = await login(baseUrl);
  const auth = { cookie: signedIn.cookie, csrf: signedIn.body.csrf_token };
  assert.equal((await api(baseUrl, "/api/not-real", auth)).status, 404);
  assert.equal((await api(baseUrl, "/api/threads/thread_1/events", {
    ...auth, method: "POST", origin: "https://attacker.invalid", body: {},
  })).status, 403);
  const malformed = await fetch(`${baseUrl}/api/threads/thread_1/events`, {
    method: "POST",
    headers: { cookie: signedIn.cookie, origin: baseUrl, "x-hermes-csrf": signedIn.body.csrf_token },
    body: "{broken",
  });
  assert.equal(malformed.status, 400);
  const oversized = await api(baseUrl, "/api/threads/thread_1/events", {
    ...auth, method: "POST", body: { value: "x".repeat(70_000) },
  });
  assert.equal(oversized.status, 413);
});

test("returns an honest gateway error when the relay is unavailable", async (t) => {
  const { baseUrl, relay } = await start(t);
  const signedIn = await login(baseUrl);
  await closeRelay(relay.server);
  const response = await api(baseUrl, "/api/threads", { cookie: signedIn.cookie });
  assert.equal(response.status, 502);
});
