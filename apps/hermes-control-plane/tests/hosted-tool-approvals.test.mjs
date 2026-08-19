import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHostedToolApproval,
  parseHostedToolPolicy,
} from "../lib/hosted-tool-approvals.ts";

test("deny always wins over allow, including always-allow", () => {
  const policy = {
    mode: "always-allow",
    rules: [
      { tool: "shell", decision: "allow" },
      { tool: "shell", decision: "deny" },
    ],
  };
  const decision = evaluateHostedToolApproval({ policy, tool: "shell", action: "run" });
  assert.equal(decision.allowed, false);
  assert.equal(decision.source, "deny_rule");
});

test("remote always-allow still cannot read secrets or change settings", () => {
  const policy = { mode: "always-allow", rules: [] };
  const secrets = evaluateHostedToolApproval({
    policy,
    remote: true,
    tool: "secrets",
    action: "read_secrets",
    remoteAction: "read_secrets",
  });
  assert.equal(secrets.allowed, false);
  assert.equal(secrets.source, "remote_cap");
  const settings = evaluateHostedToolApproval({
    policy,
    remote: true,
    tool: "settings",
    action: "change_settings",
    remoteAction: "change_settings",
  });
  assert.equal(settings.allowed, false);
  assert.equal(settings.source, "remote_cap");
});

test("last-known-good policy is kept when JSON is invalid", () => {
  const previous = { mode: "accept-edits", rules: [{ tool: "edit", decision: "deny" }] };
  const parsed = parseHostedToolPolicy("{not-json", previous);
  assert.equal(parsed.policy.mode, "accept-edits");
  assert.deepEqual(parsed.policy.rules, previous.rules);
  assert.ok(parsed.error);
  const empty = parseHostedToolPolicy("", previous);
  assert.equal(empty.policy.mode, "accept-edits");
  assert.ok(empty.error);
  const crashed = parseHostedToolPolicy("null", previous);
  assert.equal(crashed.policy.mode, "accept-edits");
  assert.ok(crashed.error);
});
