import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  evaluateToolPermission,
  isToolEnabled,
  resolvePendingAsk,
} from "../lib/tool-permission-policy.mjs";
import { canCheckpoint, restoreCheckpoint, takeCheckpoint } from "../lib/vps-checkpoint.mjs";

const NOW = 1_800_000_000_000;
const tools = ["read", "write", "bash", "stripe_charge"];

test("empty allowlist means no tools", () => {
  assert.equal(isToolEnabled("read", []), false);
  assert.equal(isToolEnabled("read"), false);
  assert.equal(evaluateToolPermission({ toolName: "read", permission: "always_allow" }).reason, "not_on_allowlist");
});

test("always_allow / always_ask / always_deny", () => {
  assert.equal(
    evaluateToolPermission({ toolName: "read", enabledTools: tools, permission: "always_allow" }).permission,
    "allow",
  );
  assert.equal(
    evaluateToolPermission({ toolName: "write", enabledTools: tools, permission: "always_ask" }).permission,
    "ask",
  );
  assert.equal(
    evaluateToolPermission({ toolName: "bash", enabledTools: tools, permission: "always_deny" }).permission,
    "deny",
  );
  assert.equal(
    evaluateToolPermission({ toolName: "read", enabledTools: tools }).reason,
    "default_deny",
  );
});

test("money, customer, and production cannot be always_allow", () => {
  for (const actionClass of ["money", "customer", "production"]) {
    const got = evaluateToolPermission({
      toolName: "stripe_charge",
      enabledTools: tools,
      permission: "always_allow",
      actionClass,
    });
    assert.equal(got.permission, "ask");
    assert.equal(got.reason, "sensitive_must_ask");
  }
});

test("pending asks do not time out; only operator or cancel resolves them", () => {
  const pending = { status: "requires_action", toolUseId: "evt_1" };
  assert.equal(resolvePendingAsk({ pending, now: NOW + 86_400_000 }).reason, "still_pending");
  assert.equal(resolvePendingAsk({ pending, result: "allow" }).permission, "allow");
  assert.equal(resolvePendingAsk({ pending, cancelled: true }).reason, "cancelled");
});

test("checkpoints only exist on the VPS", () => {
  assert.equal(canCheckpoint("laptop"), false);
  assert.equal(takeCheckpoint({ runtime: "laptop", turnId: "t1", state: { n: 1 } }).reason, "not_vps");
  const shot = takeCheckpoint({ runtime: "vps", turnId: "t1", state: { n: 1 }, now: NOW });
  assert.equal(shot.ok, true);
  const back = restoreCheckpoint({ runtime: "vps", snapshot: shot.snapshot, snapshotId: shot.snapshot.id });
  assert.deepEqual(back.state, { n: 1 });
});

test("steal comments do not contain banned product phrases", () => {
  const src = [
    readFileSync(new URL("../lib/tool-permission-policy.mjs", import.meta.url), "utf8"),
    readFileSync(new URL("../lib/vps-checkpoint.mjs", import.meta.url), "utf8"),
  ].join("\n");
  assert.doesNotMatch(src, /RUN ON|Cloud vs Local|phone leash|Team \$49|Data never leaves your computer|Continuity/i);
});
