import assert from "node:assert/strict";
import test from "node:test";

import {
  RelayStore,
  closeServer as closeRelay,
  createRelayHttpServer,
  listenOnRandomPort as listenRelay,
} from "../src/index.js";
import {
  closeServer as closeDashboard,
  createDashboardServer,
  listenOnRandomPort as listenDashboard,
} from "../../../apps/hermes-dashboard/src/dashboard-server.js";

const ACCOUNT_ID = "acct_dashboard_e2e";
const RELAY_TOKEN = "relay-dashboard-e2e-token";
const ACCESS_CODE = "dashboard-e2e-access";

function mutation(id, text, device = "phone") {
  return {
    mutation_id: id,
    author_device_id: device,
    kind: "user_message",
    payload: { message_id: `msg_${id}`, text },
  };
}

async function relayRequest(baseUrl, path, { body, token = RELAY_TOKEN, ...options } = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ access_code: ACCESS_CODE }),
  });
  const body = await response.json();
  return {
    cookie: response.headers.get("set-cookie").split(";")[0],
    csrf: body.csrf_token,
  };
}

async function dashboardRequest(baseUrl, path, auth, { body, ...options } = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      cookie: auth.cookie,
      origin: baseUrl,
      "x-hermes-csrf": auth.csrf,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("dashboard and phone converge through relay restart, deletion, and account isolation", async () => {
  const tokens = new Map([
    [RELAY_TOKEN, ACCOUNT_ID],
    ["outsider-token", "acct_outsider"],
  ]);
  let relay = createRelayHttpServer({ tokens });
  const relayBaseUrl = await listenRelay(relay.server);
  const relayPort = Number(new URL(relayBaseUrl).port);
  const dashboard = createDashboardServer({
    relayBaseUrl,
    relayToken: RELAY_TOKEN,
    accountId: ACCOUNT_ID,
    accessCode: ACCESS_CODE,
    secureCookies: false,
  });
  const dashboardBaseUrl = await listenDashboard(dashboard.server);

  try {
    assert.equal((await relayRequest(relayBaseUrl, "/v1/threads/shared/events", {
      method: "POST",
      body: mutation("phone_1", "make money today"),
    })).status, 201);

    const auth = await login(dashboardBaseUrl);
    const webWrite = await dashboardRequest(dashboardBaseUrl, "/api/threads/shared/events", auth, {
      method: "POST",
      body: mutation("web_1", "continue from the web", "web"),
    });
    assert.equal(webWrite.status, 201);
    const phoneRead = await relayRequest(relayBaseUrl, "/v1/threads/shared");
    assert.deepEqual((await phoneRead.json()).thread.messages.map(({ text }) => text), [
      "make money today",
      "continue from the web",
    ]);

    const persisted = relay.store.exportState();
    await closeRelay(relay.server);
    relay = createRelayHttpServer({ store: RelayStore.fromState(persisted), tokens });
    await new Promise((resolve, reject) => {
      relay.server.once("error", reject);
      relay.server.listen(relayPort, "127.0.0.1", resolve);
    });
    const afterRestart = await dashboardRequest(dashboardBaseUrl, "/api/threads/shared", auth);
    assert.equal(afterRestart.status, 200);
    assert.equal((await afterRestart.json()).thread.last_seq, 2);

    const outsider = await relayRequest(relayBaseUrl, "/v1/threads/shared", { token: "outsider-token" });
    assert.deepEqual((await outsider.json()).thread.messages, []);

    const deletion = await dashboardRequest(dashboardBaseUrl, "/api/threads/shared/events", auth, {
      method: "POST",
      body: {
        mutation_id: "web_delete",
        author_device_id: "web",
        kind: "thread_deleted",
        payload: { reason: "web_user_request" },
      },
    });
    assert.equal(deletion.status, 201);
    assert.deepEqual(await (await dashboardRequest(dashboardBaseUrl, "/api/threads", auth)).json(), { threads: [] });
  } finally {
    if (dashboard.server.listening) await closeDashboard(dashboard.server);
    if (relay.server.listening) await closeRelay(relay.server);
  }
});
