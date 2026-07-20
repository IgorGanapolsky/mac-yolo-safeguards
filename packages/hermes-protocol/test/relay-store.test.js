import test from "node:test";
import assert from "node:assert/strict";

import {
  MutationConflictError,
  ProtocolValidationError,
  RelayStore,
  ThreadDeletedError,
} from "../src/index.js";

function mutation(overrides = {}) {
  return {
    account_id: "acct_1",
    thread_id: "thread_1",
    mutation_id: "mut_1",
    author_device_id: "phone_1",
    kind: "user_message",
    payload: { message_id: "msg_1", text: "make money today" },
    ...overrides,
  };
}

function deterministicStore() {
  let eventNumber = 0;
  return new RelayStore({
    clock: () => "2026-07-19T12:00:00.000Z",
    eventIdFactory: () => `evt_${++eventNumber}`,
  });
}

test("append assigns sequence and retry returns the committed event", () => {
  const store = deterministicStore();
  const created = store.append(mutation());
  const retried = store.append(mutation());

  assert.equal(created.created, true);
  assert.equal(created.event.seq, 1);
  assert.equal(retried.created, false);
  assert.deepEqual(retried.event, created.event);
  retried.event.payload.text = "changed";
  assert.equal(store.getThread("acct_1", "thread_1").messages[0].text, "make money today");
});

test("same mutation id with different content is rejected", () => {
  const store = deterministicStore();
  store.append(mutation());
  assert.throws(
    () => store.append(mutation({ payload: { message_id: "msg_1", text: "different" } })),
    MutationConflictError,
  );
});

test("mutation ids and thread ids are scoped by account", () => {
  const store = deterministicStore();
  store.append(mutation());
  store.append(mutation({ account_id: "acct_2", payload: { message_id: "msg_2", text: "private" } }));

  assert.equal(store.getThread("acct_1", "thread_1").messages[0].text, "make money today");
  assert.equal(store.getThread("acct_2", "thread_1").messages[0].text, "private");
});

test("lists only events after the requested cursor and returns clones", () => {
  const store = deterministicStore();
  store.append(mutation());
  store.append(mutation({ mutation_id: "mut_2", payload: { message_id: "msg_2", text: "second" } }));

  const events = store.listEvents("acct_1", "thread_1", { afterSeq: 1 });
  assert.deepEqual(events.map((entry) => entry.seq), [2]);
  events[0].payload.text = "changed";
  assert.equal(store.listEvents("acct_1", "thread_1", { afterSeq: 1 })[0].payload.text, "second");
  assert.throws(
    () => store.listEvents("acct_1", "thread_1", { afterSeq: -1 }),
    ProtocolValidationError,
  );
});

test("deletion is terminal and survives export/import", () => {
  const store = deterministicStore();
  store.append(mutation());
  store.append(
    mutation({ mutation_id: "mut_delete", kind: "thread_deleted", payload: { reason: "user_request" } }),
  );

  assert.throws(
    () => store.append(mutation({ mutation_id: "mut_after", payload: { message_id: "msg_after", text: "after" } })),
    ThreadDeletedError,
  );
  const exported = store.exportState();
  exported.threads[0][0].payload.text = "changed outside";
  assert.equal(store.listEvents("acct_1", "thread_1")[0].payload.text, "make money today");

  const restored = RelayStore.fromState(store.exportState());
  assert.equal(restored.getThread("acct_1", "thread_1").deleted, true);
  assert.throws(
    () => restored.append(mutation({ mutation_id: "mut_after_restart" })),
    ThreadDeletedError,
  );
});

test("empty threads project to an empty live thread", () => {
  assert.deepEqual(deterministicStore().getThread("acct_1", "thread_1"), {
    schema_version: 1,
    title: null,
    deleted: false,
    messages: [],
    gaps: [],
    last_seq: 0,
  });
});

test("lists account-scoped thread summaries newest first and hides tombstones", () => {
  let tick = 0;
  const store = new RelayStore({
    clock: () => `2026-07-19T12:00:0${tick++}.000Z`,
    eventIdFactory: () => `evt_${tick}`,
  });
  store.append(mutation());
  store.append(mutation({
    thread_id: "thread_2",
    mutation_id: "mut_2",
    payload: { message_id: "msg_2", text: "second thread" },
  }));
  store.append(mutation({
    thread_id: "thread_2",
    mutation_id: "mut_title",
    kind: "thread_title_set",
    payload: { title: "Revenue plan" },
  }));
  store.append(mutation({
    account_id: "acct_2",
    thread_id: "private_thread",
    mutation_id: "private_mut",
    payload: { message_id: "private_msg", text: "private" },
  }));
  store.append(mutation({
    thread_id: "thread_1",
    mutation_id: "mut_delete",
    kind: "thread_deleted",
    payload: {},
  }));

  assert.deepEqual(store.listThreads("acct_1"), [{
    thread_id: "thread_2",
    title: "Revenue plan",
    deleted: false,
    last_seq: 2,
    updated_at: "2026-07-19T12:00:02.000Z",
    message_count: 1,
    last_message_preview: "second thread",
  }]);
  assert.equal(store.listThreads("acct_1", { includeDeleted: true }).length, 2);
  assert.equal(store.listThreads("acct_2")[0].thread_id, "private_thread");
  assert.throws(() => store.listThreads("acct_1", { includeDeleted: "yes" }), ProtocolValidationError);
});

test("rejects invalid persisted relay states", () => {
  assert.throws(() => RelayStore.fromState(null), /invalid relay state schema/);
  assert.throws(() => RelayStore.fromState({ schema_version: 2, threads: [] }), /invalid relay state schema/);
  assert.throws(() => RelayStore.fromState({ schema_version: 1, threads: {} }), /threads must be an array/);
  assert.throws(() => RelayStore.fromState({ schema_version: 1, threads: [[]] }), /must contain events/);

  const store = deterministicStore();
  store.append(mutation());
  store.append(mutation({ mutation_id: "mut_2", payload: { message_id: "msg_2", text: "second" } }));
  const state = store.exportState();

  const gap = structuredClone(state);
  gap.threads[0][1].seq = 3;
  assert.throws(() => RelayStore.fromState(gap), /not a contiguous single thread/);

  const mixed = structuredClone(state);
  mixed.threads[0][1].thread_id = "thread_2";
  assert.throws(() => RelayStore.fromState(mixed), /not a contiguous single thread/);

  const duplicateMutation = structuredClone(state);
  duplicateMutation.threads.push(structuredClone(state.threads[0]));
  duplicateMutation.threads[1].forEach((entry) => {
    entry.thread_id = "thread_2";
  });
  assert.throws(() => RelayStore.fromState(duplicateMutation), /duplicate mutation_id/);
});
