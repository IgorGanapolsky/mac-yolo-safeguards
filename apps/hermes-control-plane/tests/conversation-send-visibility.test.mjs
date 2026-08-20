import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeConversationTasks,
  pruneResolvedOptimistic,
} from "../lib/conversation-send-visibility.ts";

function task(partial) {
  return {
    result: null,
    error: null,
    route: "cloud",
    status: "pending",
    createdAt: 1,
    ...partial,
  };
}

test("merge keeps optimistic prompt until server row arrives", () => {
  const server = [task({ id: "a", prompt: "older", status: "completed", result: "done" })];
  const optimistic = [task({ id: "b", prompt: "just sent" })];
  assert.deepEqual(
    mergeConversationTasks(server, optimistic).map((row) => row.id),
    ["a", "b"],
  );
});

test("merge does not duplicate resolved ids", () => {
  const server = [task({ id: "b", prompt: "just sent", status: "running" })];
  const optimistic = [task({ id: "b", prompt: "just sent" })];
  assert.deepEqual(mergeConversationTasks(server, optimistic), server);
});

test("merge skips blank optimistic prompts", () => {
  assert.deepEqual(mergeConversationTasks([], [task({ id: "blank", prompt: "   " })]), []);
});

test("prune drops ids that landed on the server", () => {
  const optimistic = [task({ id: "b", prompt: "just sent" }), task({ id: "c", prompt: "still pending" })];
  const server = [task({ id: "b", prompt: "just sent", status: "running" })];
  assert.deepEqual(
    pruneResolvedOptimistic(optimistic, server).map((row) => row.id),
    ["c"],
  );
});
