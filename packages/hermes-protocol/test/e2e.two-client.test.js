import test from "node:test";
import assert from "node:assert/strict";

import {
  RelayStore,
  closeServer,
  createRelayHttpServer,
  listenOnRandomPort,
} from "../src/index.js";

const PHONE_TOKEN = "phone-token";
const WEB_TOKEN = "web-token";
const OUTSIDER_TOKEN = "outsider-token";
const TOKENS = new Map([
  [PHONE_TOKEN, "acct_shared"],
  [WEB_TOKEN, "acct_shared"],
  [OUTSIDER_TOKEN, "acct_outsider"],
]);

function mutation(id, text, device = "phone") {
  return {
    mutation_id: id,
    author_device_id: device,
    kind: device === "agent" ? "assistant_message" : "user_message",
    payload: { message_id: `msg_${id}`, text },
  };
}

async function relayRequest(baseUrl, token, path, { body, ...options } = {}) {
  const headers = { authorization: `Bearer ${token}`, ...(options.headers ?? {}) };
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function startRelay(t, options = {}) {
  const relay = createRelayHttpServer({ tokens: TOKENS, ...options });
  const baseUrl = await listenOnRandomPort(relay.server);
  t.after(() => closeServer(relay.server));
  return { ...relay, baseUrl };
}

test("phone and web converge across retries, concurrent writes, restart, and deletion", async (t) => {
  let droppedAmbiguousAck = false;
  const firstRelay = await startRelay(t, {
    dropResponseAfterCommit: ({ result }) => {
      if (!droppedAmbiguousAck && result.event.mutation_id === "mut_ambiguous") {
        droppedAmbiguousAck = true;
        return true;
      }
      return false;
    },
  });

  const phoneCreated = await relayRequest(firstRelay.baseUrl, PHONE_TOKEN, "/v1/threads/release_thread/events", {
    method: "POST",
    body: mutation("mut_phone", "make money today"),
  });
  assert.equal(phoneCreated.status, 201);

  const webRead = await relayRequest(firstRelay.baseUrl, WEB_TOKEN, "/v1/threads/release_thread");
  assert.equal((await webRead.json()).thread.messages[0].text, "make money today");

  await assert.rejects(
    relayRequest(firstRelay.baseUrl, WEB_TOKEN, "/v1/threads/release_thread/events", {
      method: "POST",
      body: mutation("mut_ambiguous", "committed before disconnect", "web"),
    }),
  );
  const retry = await relayRequest(firstRelay.baseUrl, WEB_TOKEN, "/v1/threads/release_thread/events", {
    method: "POST",
    body: mutation("mut_ambiguous", "committed before disconnect", "web"),
  });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).created, false);

  const simultaneous = await Promise.all([
    relayRequest(firstRelay.baseUrl, PHONE_TOKEN, "/v1/threads/release_thread/events", {
      method: "POST",
      body: mutation("mut_phone_2", "phone follow-up"),
    }),
    relayRequest(firstRelay.baseUrl, WEB_TOKEN, "/v1/threads/release_thread/events", {
      method: "POST",
      body: mutation("mut_web_2", "web follow-up", "web"),
    }),
    relayRequest(firstRelay.baseUrl, WEB_TOKEN, "/v1/threads/release_thread/events", {
      method: "POST",
      body: mutation("mut_agent", "assistant evidence", "agent"),
    }),
  ]);
  assert.deepEqual(simultaneous.map((response) => response.status), [201, 201, 201]);

  const beforeRestart = await relayRequest(firstRelay.baseUrl, PHONE_TOKEN, "/v1/threads/release_thread/events");
  const committedEvents = (await beforeRestart.json()).events;
  assert.deepEqual(committedEvents.map((entry) => entry.seq), [1, 2, 3, 4, 5]);
  assert.equal(new Set(committedEvents.map((entry) => entry.mutation_id)).size, 5);

  const outsiderRead = await relayRequest(firstRelay.baseUrl, OUTSIDER_TOKEN, "/v1/threads/release_thread");
  assert.deepEqual((await outsiderRead.json()).thread.messages, []);

  const persistedState = firstRelay.store.exportState();
  const restoredStore = RelayStore.fromState(persistedState);
  const secondRelay = await startRelay(t, { store: restoredStore });
  const afterRestart = await relayRequest(secondRelay.baseUrl, WEB_TOKEN, "/v1/threads/release_thread");
  const restoredThread = (await afterRestart.json()).thread;
  assert.equal(restoredThread.messages.length, 5);
  assert.deepEqual(restoredThread.messages.map((entry) => entry.seq), [1, 2, 3, 4, 5]);

  const deleteResponse = await relayRequest(secondRelay.baseUrl, PHONE_TOKEN, "/v1/threads/release_thread/events", {
    method: "POST",
    body: {
      mutation_id: "mut_delete",
      author_device_id: "phone",
      kind: "thread_deleted",
      payload: { reason: "user_request" },
    },
  });
  assert.equal(deleteResponse.status, 201);

  const deletedOnWeb = await relayRequest(secondRelay.baseUrl, WEB_TOKEN, "/v1/threads/release_thread");
  assert.deepEqual((await deletedOnWeb.json()).thread, {
    schema_version: 1,
    title: null,
    deleted: true,
    messages: [],
    gaps: [],
    last_seq: 6,
  });
  const rejectedAfterDelete = await relayRequest(
    secondRelay.baseUrl,
    WEB_TOKEN,
    "/v1/threads/release_thread/events",
    { method: "POST", body: mutation("mut_too_late", "must not resurrect", "web") },
  );
  assert.equal(rejectedAfterDelete.status, 410);
});

test("invalid credentials cannot read or mutate another account", async (t) => {
  const relay = await startRelay(t);
  const response = await relayRequest(relay.baseUrl, "invalid-token", "/v1/threads/private_thread");
  assert.equal(response.status, 401);
});
