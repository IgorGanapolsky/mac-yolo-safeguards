import { describe, expect, it } from "vitest";
import { decideTaskRoute, parseRoutePreference } from "./task-routing";

const now = 1_000_000;

describe("parseRoutePreference", () => {
  it("accepts local cloud auto and defaults unknown to auto", () => {
    expect(parseRoutePreference("local")).toBe("local");
    expect(parseRoutePreference("cloud")).toBe("cloud");
    expect(parseRoutePreference("auto")).toBe("auto");
    expect(parseRoutePreference("nope")).toBe("auto");
    expect(parseRoutePreference(undefined)).toBe("auto");
  });
});

describe("decideTaskRoute", () => {
  const onlineDevice = { failoverMode: "manual" as const, lastSeenAt: now - 10_000 };
  const offlineDevice = { failoverMode: "manual" as const, lastSeenAt: now - 120_000 };
  const offlineAuto = { failoverMode: "auto" as const, lastSeenAt: now - 120_000 };
  const offlineDisabled = { failoverMode: "disabled" as const, lastSeenAt: now - 120_000 };

  it("cloud preference always uses Continuity even when Mac is online", () => {
    expect(decideTaskRoute({ preference: "cloud", device: onlineDevice, now })).toEqual({
      status: "cloud_pending",
      route: "cloud",
      preference: "cloud",
    });
  });

  it("local preference uses Mac when online and blocks when offline", () => {
    expect(decideTaskRoute({ preference: "local", device: onlineDevice, now }).route).toBe("local");
    expect(decideTaskRoute({ preference: "local", device: offlineDevice, now })).toEqual({
      status: "offline_blocked",
      route: "blocked",
      preference: "local",
    });
  });

  it("auto keeps offline failover semantics", () => {
    expect(decideTaskRoute({ preference: "auto", device: onlineDevice, now }).route).toBe("local");
    expect(decideTaskRoute({ preference: "auto", device: offlineAuto, now })).toEqual({
      status: "cloud_pending",
      route: "cloud",
      preference: "auto",
    });
    expect(decideTaskRoute({ preference: "auto", device: offlineDevice, now }).status).toBe("needs_failover");
    expect(decideTaskRoute({ preference: "auto", device: offlineDisabled, now }).status).toBe("offline_blocked");
  });
});
