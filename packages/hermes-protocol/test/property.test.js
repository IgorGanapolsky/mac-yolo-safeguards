import test from "node:test";
import assert from "node:assert/strict";

import { RelayStore, projectThread } from "../src/index.js";

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

test("10,000 randomized retry attempts never duplicate or reorder committed messages", () => {
  const uniqueCount = 2_000;
  const attemptCount = 10_000;
  const random = seededRandom(20_260_719);
  let eventNumber = 0;
  const store = new RelayStore({
    clock: () => "2026-07-19T12:00:00.000Z",
    eventIdFactory: () => `evt_${++eventNumber}`,
  });
  const mutations = Array.from({ length: uniqueCount }, (_, index) => ({
    account_id: "acct_property",
    thread_id: "thread_property",
    mutation_id: `mut_${index}`,
    author_device_id: index % 2 === 0 ? "phone" : "web",
    kind: index % 3 === 0 ? "assistant_message" : "user_message",
    payload: { message_id: `msg_${index}`, text: `message ${index}` },
  }));
  const attempts = [
    ...mutations,
    ...Array.from({ length: attemptCount - uniqueCount }, () => mutations[Math.floor(random() * uniqueCount)]),
  ];

  let createdCount = 0;
  for (const input of shuffle(attempts, random)) {
    if (store.append(input).created) createdCount += 1;
  }

  assert.equal(createdCount, uniqueCount);
  const committed = store.listEvents("acct_property", "thread_property");
  assert.equal(committed.length, uniqueCount);
  assert.deepEqual(
    committed.map((entry) => entry.seq),
    Array.from({ length: uniqueCount }, (_, index) => index + 1),
  );

  const noisyDelivery = shuffle([...committed, ...committed.slice(0, 500)], random);
  const projection = projectThread(noisyDelivery);
  assert.equal(projection.messages.length, uniqueCount);
  assert.equal(new Set(projection.messages.map((message) => message.message_id)).size, uniqueCount);
  assert.deepEqual(
    projection.messages.map((message) => message.seq),
    Array.from({ length: uniqueCount }, (_, index) => index + 1),
  );
  assert.deepEqual(projection.gaps, []);
});
