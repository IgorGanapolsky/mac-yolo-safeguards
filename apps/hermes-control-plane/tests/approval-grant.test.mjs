import assert from "node:assert/strict";
import test from "node:test";
import { consumeGrant, issueGrant } from "../lib/approval-grant.mjs";
import { assertSafeForModel, redactSecretsForModel } from "../lib/secret-redact.mjs";

const now = 1_700_000_000_000;

test("default deny when the window is missing", () => {
  assert.equal(issueGrant({ actionClass: "browser" }).allowed, false);
  assert.equal(issueGrant({ actionClass: "browser", window: "forever" }).reason, "default_deny");
});

test("once / 10m / always for non-sensitive tools", () => {
  assert.equal(issueGrant({ actionClass: "browser", window: "once", now }).remainingUses, 1);
  assert.equal(issueGrant({ actionClass: "browser", window: "10m", now }).expiresAt, now + 10 * 60 * 1000);
  assert.equal(issueGrant({ actionClass: "browser", window: "always", now }).expiresAt, null);
});

test("money, customer, and production cannot be always or 10m", () => {
  for (const actionClass of ["money", "customer", "production"]) {
    assert.equal(issueGrant({ actionClass, window: "always" }).reason, "sensitive_once_only");
    assert.equal(issueGrant({ actionClass, window: "10m" }).reason, "sensitive_once_only");
    assert.equal(issueGrant({ actionClass, window: "once", now }).allowed, true);
  }
});

test("once is consumed after one use; 10m expires", () => {
  const once = issueGrant({ actionClass: "browser", window: "once", now });
  const first = consumeGrant({ grant: once, now });
  assert.equal(first.allowed, true);
  assert.equal(first.grant.remainingUses, 0);
  assert.equal(consumeGrant({ grant: first.grant, now }).reason, "consumed");
  const ten = issueGrant({ actionClass: "browser", window: "10m", now });
  assert.equal(consumeGrant({ grant: ten, now: now + 10 * 60 * 1000 + 1 }).reason, "expired");
});

test("credentials never reach the model", () => {
  const raw = "token=sk-abcdefghijklmnopqrstuvwxyz and Bearer supersecrettokenvalue";
  const redacted = redactSecretsForModel(raw);
  assert.match(redacted, /\[redacted-secret\]/);
  assert.doesNotMatch(redacted, /sk-abcdefghijklmnopqrstuvwxyz/);
  assert.equal(assertSafeForModel(raw).safe, false);
  assert.equal(assertSafeForModel("the laptop slept and the run died").safe, true);
});
