import { describe, expect, it } from "vitest";
import { hasCloudContinuationAccess, hasLocalControlAccess } from "./entitlements";

describe("hasLocalControlAccess", () => {
  it("allows any non-suspended plan", () => {
    expect(hasLocalControlAccess("free")).toBe(true);
    expect(hasLocalControlAccess("trial")).toBe(true);
    expect(hasLocalControlAccess("pro")).toBe(true);
  });

  it("denies suspended and missing plans", () => {
    expect(hasLocalControlAccess("suspended")).toBe(false);
    expect(hasLocalControlAccess(null)).toBe(false);
    expect(hasLocalControlAccess(undefined)).toBe(false);
    expect(hasLocalControlAccess("")).toBe(false);
  });
});

describe("hasCloudContinuationAccess", () => {
  const now = 1_800_000_000_000;

  it("always allows pro and team", () => {
    expect(hasCloudContinuationAccess({ plan: "pro", trialEndsAt: null }, now)).toBe(true);
    expect(hasCloudContinuationAccess({ plan: "team", trialEndsAt: 0 }, now)).toBe(true);
  });

  it("allows an unexpired trial and cuts off at expiry", () => {
    expect(hasCloudContinuationAccess({ plan: "trial", trialEndsAt: now }, now)).toBe(true);
    expect(hasCloudContinuationAccess({ plan: "trial", trialEndsAt: now - 1 }, now)).toBe(false);
  });

  it("denies trial without an end date and other plans", () => {
    expect(hasCloudContinuationAccess({ plan: "trial", trialEndsAt: null }, now)).toBe(false);
    expect(hasCloudContinuationAccess({ plan: "free", trialEndsAt: now + 1000 }, now)).toBe(false);
    expect(hasCloudContinuationAccess({ plan: "suspended", trialEndsAt: null }, now)).toBe(false);
  });
});
