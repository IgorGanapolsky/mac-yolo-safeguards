import { describe, expect, it } from "vitest";
import {
  GRANT_DURATION_POLICY_VERSION,
  GRANT_DURATIONS,
  GrantStore,
  TEN_MINUTE_GRANT_MS,
  consumeGrant,
  evaluateGrant,
  isGrantDuration,
  mintGrant,
  revokeGrant,
} from "./grant-duration";

const NOW = 1_800_000_000_000;

describe("grant duration (Vellum once / 10m / always)", () => {
  it("exposes only the stolen windows and default-deny vocabulary", () => {
    expect(GRANT_DURATIONS).toEqual(["once", "10m", "always"]);
    expect(GRANT_DURATION_POLICY_VERSION).toBe("2026-08-18.1");
    expect(isGrantDuration("once")).toBe(true);
    expect(isGrantDuration("10m")).toBe(true);
    expect(isGrantDuration("always")).toBe(true);
    expect(isGrantDuration("session")).toBe(false);
    expect(isGrantDuration("forever")).toBe(false);
    expect(isGrantDuration("deny")).toBe(false);
  });

  it("fails closed when no grant exists", () => {
    expect(evaluateGrant(null, { toolName: "host_bash", now: NOW })).toMatchObject({
      allowed: false,
      code: "default_deny",
      policyVersion: GRANT_DURATION_POLICY_VERSION,
    });
  });

  it("consumes a once grant on the first matching use", () => {
    const grant = mintGrant({ toolName: "host_bash", duration: "once", now: NOW, id: "g1" });
    const first = consumeGrant(grant, { toolName: "host_bash", now: NOW });
    expect(first.decision).toMatchObject({ allowed: true, duration: "once", grantId: "g1" });
    expect(first.grant.remainingUses).toBe(0);
    expect(evaluateGrant(first.grant, { toolName: "host_bash", now: NOW + 1 })).toMatchObject({
      allowed: false,
      code: "consumed",
    });
  });

  it("keeps a 10-minute grant live until the window ends, then denies", () => {
    const grant = mintGrant({ toolName: "host_file_write", duration: "10m", now: NOW, id: "g10" });
    expect(grant.expiresAt).toBe(NOW + TEN_MINUTE_GRANT_MS);
    expect(evaluateGrant(grant, { toolName: "host_file_write", now: NOW + TEN_MINUTE_GRANT_MS - 1 })).toMatchObject({
      allowed: true,
      duration: "10m",
      remainingMs: 1,
    });
    expect(evaluateGrant(grant, { toolName: "host_file_write", now: NOW + TEN_MINUTE_GRANT_MS })).toMatchObject({
      allowed: false,
      code: "expired",
    });
  });

  it("lets an always grant survive past 10 minutes until revoked", () => {
    const grant = mintGrant({ toolName: "web_fetch", duration: "always", now: NOW, id: "ga" });
    expect(grant.expiresAt).toBeNull();
    expect(evaluateGrant(grant, { toolName: "web_fetch", now: NOW + TEN_MINUTE_GRANT_MS * 50 })).toMatchObject({
      allowed: true,
      duration: "always",
      remainingMs: null,
    });
    expect(evaluateGrant(revokeGrant(grant, NOW + 1), { toolName: "web_fetch", now: NOW + 2 })).toMatchObject({
      allowed: false,
      code: "revoked",
    });
  });

  it("does not let a grant for one tool authorize another", () => {
    const grant = mintGrant({ toolName: "host_bash", duration: "always", now: NOW });
    expect(evaluateGrant(grant, { toolName: "host_file_write", now: NOW })).toMatchObject({
      allowed: false,
      code: "tool_mismatch",
    });
  });

  it("store: deny and unknown durations stay default-deny; once does not leak to the next call", () => {
    const store = new GrantStore();
    expect(store.authorize("host_bash", NOW)).toMatchObject({ allowed: false, code: "default_deny" });
    expect(store.decide({ toolName: "host_bash", action: "deny", now: NOW })).toMatchObject({
      allowed: false,
      code: "operator_deny",
    });
    expect(store.decide({ toolName: "host_bash", action: "session", now: NOW })).toMatchObject({
      allowed: false,
      code: "invalid_duration",
    });
    expect(store.decide({ toolName: "host_bash", action: "once", now: NOW })).toMatchObject({
      allowed: true,
      duration: "once",
    });
    expect(store.authorize("host_bash", NOW + 1)).toMatchObject({ allowed: false, code: "default_deny" });
  });

  it("store: 10m then always, then revoke, stay fail-closed", () => {
    const store = new GrantStore();
    expect(store.decide({ toolName: "host_bash", action: "10m", now: NOW })).toMatchObject({
      allowed: true,
      duration: "10m",
      remainingMs: TEN_MINUTE_GRANT_MS,
    });
    expect(store.authorize("host_bash", NOW + 60_000)).toMatchObject({ allowed: true, duration: "10m" });
    expect(store.authorize("host_bash", NOW + TEN_MINUTE_GRANT_MS)).toMatchObject({
      allowed: false,
      code: "expired",
    });
    expect(store.decide({ toolName: "host_bash", action: "always", now: NOW + TEN_MINUTE_GRANT_MS })).toMatchObject({
      allowed: true,
      duration: "always",
    });
    expect(store.authorize("host_bash", NOW + TEN_MINUTE_GRANT_MS + 1)).toMatchObject({
      allowed: true,
      duration: "always",
    });
    store.revoke("host_bash", NOW + TEN_MINUTE_GRANT_MS + 2);
    expect(store.authorize("host_bash", NOW + TEN_MINUTE_GRANT_MS + 3)).toMatchObject({
      allowed: false,
      code: "revoked",
    });
  });
});
