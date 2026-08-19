import assert from "node:assert/strict";
import test from "node:test";
import { handoffSession, publicSessionView, stripSecrets } from "../lib/hosted-session-handoff.ts";

test("handoff preserves history, memory, and policy while swapping route", () => {
  const policy = { mode: "always-ask", rules: [{ tool: "shell", decision: "deny" }] };
  const start = {
    taskId: "task-9",
    history: "fact: hosted Hermes is $10/mo\n",
    memoryFacts: ["fact: hosted Hermes is $10/mo"],
    toolPolicy: policy,
    route: "route-a",
    branch: "fix/kill-machine-found-pair-toast",
    runtime: "vps",
  };
  const { session, receipt } = handoffSession(start, {
    fromRoute: "route-a",
    toRoute: "route-b",
    reason: "quota exhausted",
  });
  assert.equal(session.route, "route-b");
  assert.deepEqual(session.toolPolicy, policy);
  assert.match(session.history, /fact: hosted Hermes is \$10\/mo/);
  assert.match(session.history, /fact: route changed because quota exhausted/);
  assert.ok(session.memoryFacts.includes("fact: hosted Hermes is $10/mo"));
  assert.equal(receipt.ok, true);
  assert.equal("prompt" in receipt, false);
  assert.equal(JSON.stringify(receipt).includes("OPENAI_API_KEY"), false);
  assert.doesNotMatch(JSON.stringify(receipt), /sk-[a-zA-Z0-9]{8,}/);
});

test("public session view strips tokens, keys, and does not copy secrets", () => {
  process.env.OPENAI_API_KEY = "sk-leaked-from-env-should-not-appear";
  const view = publicSessionView({
    taskId: "task-9",
    history: "secret prompt body",
    memoryFacts: ["fact: laptop is cache"],
    toolPolicy: { mode: "always-ask", rules: [] },
    route: "route-b",
    runtime: "vps",
  });
  const dumped = JSON.stringify(view);
  assert.equal(dumped.includes("sk-leaked-from-env-should-not-appear"), false);
  assert.equal(dumped.includes("secret prompt body"), false);
  assert.equal("history" in view, false);
  assert.deepEqual(stripSecrets({ OPENAI_API_KEY: "sk-abc123456", token: "secret" }), {
    OPENAI_API_KEY: "[redacted]",
    token: "[redacted]",
  });
});
