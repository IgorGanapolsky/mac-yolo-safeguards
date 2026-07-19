import test from "node:test";
import assert from "node:assert/strict";

import {
  ProtocolValidationError,
  mutationFingerprint,
  projectThread,
  validateEvent,
  validateId,
  validateMutation,
  validatePayload,
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

function event(seq, overrides = {}) {
  return {
    ...mutation({ mutation_id: `mut_${seq}`, payload: { message_id: `msg_${seq}`, text: `text ${seq}` } }),
    schema_version: 1,
    event_id: `evt_${seq}`,
    seq,
    occurred_at: `2026-07-19T00:00:0${Math.min(seq, 9)}.000Z`,
    ...overrides,
  };
}

test("validates and clones a supported mutation", () => {
  const input = mutation({
    payload: {
      message_id: "msg_1",
      text: "make money today",
      attachments: [{ name: "proof.txt", size: 12 }],
    },
  });
  const value = validateMutation(input);

  assert.equal(value.schema_version, 1);
  assert.deepEqual(value.payload.attachments, [{ name: "proof.txt", size: 12 }]);
  input.payload.attachments[0].name = "changed.txt";
  assert.equal(value.payload.attachments[0].name, "proof.txt");
});

test("rejects malformed identifiers and unsupported mutations", () => {
  for (const invalid of [undefined, "", " bad", "a/b", "x".repeat(129)]) {
    assert.throws(() => validateId(invalid, "id"), ProtocolValidationError);
  }
  assert.throws(() => validateMutation(null), /mutation must be an object/);
  assert.throws(() => validateMutation(mutation({ kind: "unknown" })), /unsupported event kind/);
});

test("rejects non-JSON payloads and invalid message payloads", () => {
  assert.throws(
    () => validatePayload("user_message", { message_id: "msg_1", text: "ok", value: Number.NaN }),
    /non-finite/,
  );
  assert.throws(
    () => validatePayload("user_message", { message_id: "msg_1", text: "ok", value: new Date() }),
    /only JSON values/,
  );
  assert.throws(() => validatePayload("user_message", []), /payload must be an object/);
  assert.throws(
    () => validatePayload("user_message", { message_id: "msg_1", text: 7 }),
    /text must be a string/,
  );
  assert.throws(
    () => validatePayload("user_message", { message_id: "msg_1", text: "x".repeat(200_001) }),
    /text is too large/,
  );
  assert.throws(
    () => validatePayload("user_message", { message_id: "msg_1", text: "ok", attachments: {} }),
    /attachments must be an array/,
  );
  assert.throws(
    () =>
      validatePayload("user_message", {
        message_id: "msg_1",
        text: "ok",
        attachments: Array.from({ length: 21 }, () => null),
      }),
    /too many entries/,
  );
});

test("validates title and deletion payloads", () => {
  assert.deepEqual(validatePayload("thread_title_set", { title: "Evidence" }), { title: "Evidence" });
  assert.deepEqual(validatePayload("thread_deleted", {}), {});
  assert.deepEqual(validatePayload("thread_deleted", { reason: "user_request" }), {
    reason: "user_request",
  });
  assert.throws(() => validatePayload("thread_title_set", { title: "  " }), /non-empty/);
  assert.throws(
    () => validatePayload("thread_title_set", { title: "x".repeat(501) }),
    /title is too large/,
  );
  assert.throws(() => validatePayload("thread_deleted", { reason: 7 }), /reason must be a string/);
  assert.throws(() => validatePayload("not_real", {}), /unsupported event kind/);
});

test("validates committed event metadata", () => {
  assert.equal(validateEvent(event(1)).event_id, "evt_1");
  assert.throws(() => validateEvent({ ...event(1), schema_version: 2 }), /unsupported schema_version/);
  assert.throws(() => validateEvent({ ...event(1), seq: 0 }), /seq must be a positive integer/);
  assert.throws(() => validateEvent({ ...event(1), occurred_at: "never" }), /ISO date/);
});

test("fingerprints semantic mutation content deterministically", () => {
  const first = mutation();
  const second = { ...first, schema_version: 99, event_id: "ignored", seq: 50 };
  assert.equal(mutationFingerprint(first), mutationFingerprint(second));
  assert.notEqual(mutationFingerprint(first), mutationFingerprint(mutation({ payload: { message_id: "msg_1", text: "different" } })));
});

test("projects reordered duplicate delivery with gaps deterministically", () => {
  const title = event(2, {
    mutation_id: "mut_title",
    event_id: "evt_title",
    kind: "thread_title_set",
    payload: { title: "Shared thread" },
  });
  const assistant = event(4, {
    mutation_id: "mut_assistant",
    event_id: "evt_assistant",
    author_device_id: "web_1",
    kind: "assistant_message",
    payload: { message_id: "msg_assistant", text: "Evidence ready", attachments: [{ name: "proof.json" }] },
  });

  const projection = projectThread([assistant, event(1), structuredClone(assistant), title]);
  assert.equal(projection.title, "Shared thread");
  assert.equal(projection.last_seq, 4);
  assert.deepEqual(projection.gaps, [{ from_seq: 3, to_seq: 3 }]);
  assert.deepEqual(
    projection.messages.map(({ role, text, seq }) => ({ role, text, seq })),
    [
      { role: "user", text: "text 1", seq: 1 },
      { role: "assistant", text: "Evidence ready", seq: 4 },
    ],
  );
  assistant.payload.attachments[0].name = "changed";
  assert.equal(projection.messages[1].attachments[0].name, "proof.json");
});

test("a deletion tombstone clears messages and ignores later content", () => {
  const deleted = event(2, {
    mutation_id: "mut_delete",
    event_id: "evt_delete",
    kind: "thread_deleted",
    payload: { reason: "user_request" },
  });
  const projection = projectThread([event(3), deleted, event(1)]);

  assert.equal(projection.deleted, true);
  assert.deepEqual(projection.messages, []);
  assert.equal(projection.last_seq, 3);
});

test("projection requires an event array", () => {
  assert.throws(() => projectThread({}), /events must be an array/);
});
