import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_GATED_INTERRUPT_CONFIG,
  completeGatedHostedTool,
  createHostedHitlInterrupt,
  evaluateHostedToolApproval,
  evaluateOutboundEmail,
  interruptConfigForClass,
  parseHostedToolPolicy,
  persistHumanDeny,
} from "../lib/hosted-tool-approvals.ts";

const NOW = 1_800_000_000_000;

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

test("gated send/spend tools open a typed interrupt and do not complete without a human receipt", () => {
  for (const row of [
    { tool: "stripe_charge", action: "charge", actionClass: "money" },
    { tool: "send_email", action: "draft", actionClass: "send" },
    { tool: "schedule_meeting", action: "create_event", actionClass: "calendar" },
    { tool: "crm_update", action: "customer", actionClass: "customer" },
    { tool: "deploy", action: "production", actionClass: "production" },
  ]) {
    const interrupt = createHostedHitlInterrupt(row);
    assert.ok(interrupt, `expected interrupt for ${row.tool}`);
    assert.equal(interrupt.status, "open");
    assert.equal(interrupt.surface, "thumbgate.app");
    assert.deepEqual(interrupt.config, { ...DEFAULT_GATED_INTERRUPT_CONFIG });
    assert.equal(interrupt.config.allow_accept, true);
    assert.equal(interrupt.config.allow_ignore, true);
    assert.equal(interrupt.config.allow_edit, true);
    assert.deepEqual(interruptConfigForClass(interrupt.toolClass), { ...DEFAULT_GATED_INTERRUPT_CONFIG });

    const result = completeGatedHostedTool({
      ...row,
      policy: { mode: "always-allow", rules: [{ tool: row.tool, decision: "allow" }] },
      now: NOW,
    });
    assert.equal(result.completed, false);
    assert.equal(result.sent, false);
    assert.equal(result.spent, false);
    assert.equal(result.mutatedProd, false);
    assert.equal(result.receipt.outcome, "paused");
    assert.notEqual(result.receipt.outcome, "done");
    assert.equal(result.interrupt?.status, "open");
  }
});

test("ignore/deny ends the action and does not send", () => {
  for (const type of ["ignore", "deny"]) {
    const result = completeGatedHostedTool({
      tool: "send_email",
      action: "draft",
      actionClass: "send",
      policy: { mode: "always-allow", rules: [{ tool: "send_email", decision: "allow" }] },
      humanDecision: { type, surface: "thumbgate.app" },
      now: NOW,
    });
    assert.equal(result.completed, false);
    assert.equal(result.sent, false);
    assert.equal(result.receipt.outcome, "denied");
    assert.ok(result.policy.rules.some((rule) => rule.decision === "deny" && rule.toolClass === "send"));
  }
});

test("unresolved interrupt is a fail-closed pause, not success", () => {
  const result = completeGatedHostedTool({
    tool: "stripe_charge",
    action: "charge",
    actionClass: "money",
    policy: { mode: "always-allow", rules: [] },
    humanDecision: null,
    now: NOW,
  });
  assert.equal(result.completed, false);
  assert.equal(result.spent, false);
  assert.equal(result.receipt.outcome, "paused");
  assert.equal(result.interrupt?.status, "open");
  assert.match(result.receipt.note, /does not send, spend, or mutate prod/);
});

test("deny-beats-allow: prior human deny wins over a later parsed allow", () => {
  const afterIgnore = persistHumanDeny(
    { mode: "always-ask", rules: [] },
    { tool: "stripe_charge", action: "charge", toolClass: "money" },
  );
  const parsed = parseHostedToolPolicy(
    JSON.stringify({
      mode: "always-allow",
      rules: [{ tool: "stripe_charge", decision: "allow" }],
    }),
    afterIgnore,
  );
  assert.equal(parsed.error, null);
  assert.ok(parsed.policy.rules.some((rule) => rule.decision === "deny" && rule.toolClass === "money"));
  const decision = evaluateHostedToolApproval({
    policy: parsed.policy,
    tool: "stripe_charge",
    action: "charge",
    toolClass: "money",
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.source, "deny_rule");

  const later = completeGatedHostedTool({
    tool: "stripe_charge",
    action: "charge",
    actionClass: "money",
    policy: parsed.policy,
    humanDecision: { type: "accept", surface: "thumbgate.app" },
    now: NOW,
  });
  assert.equal(later.completed, false);
  assert.equal(later.spent, false);
  assert.equal(later.receipt.outcome, "denied");
});

test("edit rewrites args and stays gated", () => {
  const result = completeGatedHostedTool({
    tool: "stripe_charge",
    action: "charge",
    actionClass: "money",
    args: { amount: 50 },
    humanDecision: { type: "edit", args: { amount: 9 }, surface: "thumbgate.app" },
    now: NOW,
  });
  assert.equal(result.completed, false);
  assert.equal(result.spent, false);
  assert.deepEqual(result.args, { amount: 9 });
  assert.equal(result.interrupt?.status, "open");
  assert.equal(result.receipt.outcome, "paused");
});

test("accept only counts on thumbgate.app and never auto-accepts", () => {
  const wrongSurface = completeGatedHostedTool({
    tool: "deploy",
    action: "production",
    actionClass: "production",
    humanDecision: { type: "accept", surface: "phone" },
    now: NOW,
  });
  assert.equal(wrongSurface.completed, false);
  assert.equal(wrongSurface.mutatedProd, false);
  assert.equal(wrongSurface.interrupt?.status, "open");

  const accepted = completeGatedHostedTool({
    tool: "deploy",
    action: "production",
    actionClass: "production",
    humanDecision: { type: "accept", surface: "thumbgate.app" },
    now: NOW,
  });
  assert.equal(accepted.completed, true);
  assert.equal(accepted.interrupt?.status, "accepted");
});

test("outbound email is drafts-only and never sends", () => {
  const send = evaluateOutboundEmail({ tool: "write_email", action: "send" });
  assert.equal(send.allowed, false);
  assert.equal(send.mode, "drafts_only");
  const result = completeGatedHostedTool({
    tool: "write_email",
    action: "send",
    humanDecision: { type: "accept", surface: "thumbgate.app" },
    now: NOW,
  });
  assert.equal(result.completed, false);
  assert.equal(result.sent, false);
  assert.equal(result.receipt.outcome, "draft_only");
});

test("production files we touch do not import langgraph, langchain, or agent-inbox", () => {
  const src = readFileSync(new URL("../lib/hosted-tool-approvals.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from ["']langgraph["']|require\(["']langgraph["']\)/);
  assert.doesNotMatch(src, /from ["']langchain["']|require\(["']langchain["']\)/);
  assert.doesNotMatch(src, /from ["']@?langchain|from ["']langgraph|agent-inbox/i);
  assert.doesNotMatch(src, /import\s*\{[^}]*\binterrupt\b[^}]*\}\s*from\s*["']langgraph/);
});
