import { describe, expect, it } from "vitest";
import {
  decideDevicePairing,
  devicePresenceLabel,
  isDeviceOnline,
  isDeviceStale,
} from "./device-pairing";

describe("decideDevicePairing", () => {
  it("creates a new device when fingerprint is unknown", () => {
    const decision = decideDevicePairing({
      existing: null,
      defaultFailover: "auto",
      newDeviceId: "new-id",
    });
    expect(decision).toEqual({
      kind: "create",
      deviceId: "new-id",
      failoverMode: "auto",
      reused: false,
    });
  });

  it("reuses an active device and keeps its offline policy", () => {
    const decision = decideDevicePairing({
      existing: {
        id: "existing-1",
        failoverMode: "manual",
        revokedAt: null,
      },
      defaultFailover: "auto",
      newDeviceId: "ignored",
    });
    expect(decision).toEqual({
      kind: "reuse",
      deviceId: "existing-1",
      failoverMode: "manual",
      reused: true,
    });
  });

  it("revives a revoked twin with the org default failover mode", () => {
    const decision = decideDevicePairing({
      existing: {
        id: "ghost-1",
        failoverMode: "disabled",
        revokedAt: 1_700_000_000_000,
      },
      defaultFailover: "auto",
      newDeviceId: "ignored",
    });
    expect(decision).toEqual({
      kind: "reuse",
      deviceId: "ghost-1",
      failoverMode: "auto",
      reused: true,
    });
  });

  it("does not invent a second id for the same fingerprint", () => {
    const a = decideDevicePairing({
      existing: { id: "same", failoverMode: "manual", revokedAt: null },
      defaultFailover: "manual",
      newDeviceId: "uuid-a",
    });
    const b = decideDevicePairing({
      existing: { id: "same", failoverMode: "manual", revokedAt: null },
      defaultFailover: "manual",
      newDeviceId: "uuid-b",
    });
    expect(a.deviceId).toBe("same");
    expect(b.deviceId).toBe("same");
    expect(a.deviceId).toBe(b.deviceId);
  });
});

describe("device presence", () => {
  const now = 1_000_000;

  it("is online within 60s", () => {
    expect(isDeviceOnline(now - 30_000, now)).toBe(true);
    expect(isDeviceOnline(now - 61_000, now)).toBe(false);
    expect(isDeviceOnline(null, now)).toBe(false);
  });

  it("is stale after 2h offline", () => {
    expect(isDeviceStale(now - 2 * 60 * 60 * 1000, now)).toBe(true);
    expect(isDeviceStale(now - 90 * 60 * 1000, now)).toBe(false);
    expect(isDeviceStale(now - 10_000, now)).toBe(false);
    expect(isDeviceStale(null, now)).toBe(false);
  });

  it("labels online / stale / offline", () => {
    expect(devicePresenceLabel(now - 5_000, now)).toBe("online");
    expect(devicePresenceLabel(now - 3 * 60 * 60 * 1000, now)).toBe("stale");
    expect(devicePresenceLabel(now - 10 * 60 * 1000, now)).toBe("offline");
    expect(devicePresenceLabel(null, now)).toBe("offline");
  });
});
