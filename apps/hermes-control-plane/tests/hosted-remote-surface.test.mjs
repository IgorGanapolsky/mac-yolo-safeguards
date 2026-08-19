import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPROVAL_SURFACE,
  HOSTED_REMOTE_CAPABILITIES,
  confirmOnTrustedSurface,
  evaluateRemoteAction,
} from "../lib/hosted-remote-surface.ts";

const product = [
  "../lib/hosted-remote-surface.ts",
  "../lib/hosted-source-of-truth.ts",
  "../lib/hosted-tool-approvals.ts",
  "../lib/hosted-session-handoff.ts",
  "../lib/hosted-memory-tiers.ts",
  "../lib/hosted-edit-anchor.ts",
  "../lib/hosted-apphost.ts",
  "../lib/cloud-tool-policy.ts",
  "../app/api/health/route.ts",
  "../app/api/tasks/route.ts",
].map((rel) => readFileSync(new URL(rel, import.meta.url), "utf8")).join("\n");

test("remote session can chat and answer permissions only", () => {
  assert.deepEqual({ ...HOSTED_REMOTE_CAPABILITIES }, {
    canChat: true,
    canAnswerPermissions: true,
    canReadSecrets: false,
    canChangeSettings: false,
  });
  assert.equal(evaluateRemoteAction("chat").allowed, true);
  assert.equal(evaluateRemoteAction("answer_permissions").allowed, true);
  const secrets = evaluateRemoteAction("read_secrets");
  assert.equal(secrets.allowed, false);
  assert.match(secrets.reason, /cannot read secrets/);
  const settings = evaluateRemoteAction("change_settings");
  assert.equal(settings.allowed, false);
  assert.match(settings.reason, /cannot change settings/);
});

test("pairing confirmation stays on thumbgate.app", () => {
  assert.equal(APPROVAL_SURFACE, "thumbgate.app");
  assert.equal(confirmOnTrustedSurface("thumbgate.app").ok, true);
  assert.equal(confirmOnTrustedSurface("client").ok, false);
});

test("do not steal remote-desktop marketplace copy", () => {
  assert.doesNotMatch(product, /poolside|tailscale|acp|laguna|\bmlx\b/i);
  assert.doesNotMatch(product, /qr pair|from your phone/i);
  assert.doesNotMatch(product, /Machine found|lid-close/);
  assert.doesNotMatch(product, /\bOrigin\b|\bSpokes\b|x402|USDC/i);
});
