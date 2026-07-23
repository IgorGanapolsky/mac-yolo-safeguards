import { describe, expect, it } from "vitest";
import { buildContinuityUsage, CONTINUITY_PACK_RUNS } from "./continuity-usage";

const now = 1_700_000_000_000;

describe("buildContinuityUsage", () => {
  it("shows pro included quota and remaining", () => {
    const snap = buildContinuityUsage({
      plan: "pro",
      trialEndsAt: null,
      used: 12,
      bonus: 0,
      now,
    });
    expect(snap.cloudAccess).toBe(true);
    expect(snap.baseLimit).toBe(100);
    expect(snap.limit).toBe(100);
    expect(snap.used).toBe(12);
    expect(snap.remaining).toBe(88);
    expect(snap.packRuns).toBe(CONTINUITY_PACK_RUNS);
  });

  it("adds pack bonus to the effective limit", () => {
    const snap = buildContinuityUsage({
      plan: "pro",
      trialEndsAt: null,
      used: 100,
      bonus: 50,
      packConfigured: true,
      now,
    });
    expect(snap.limit).toBe(150);
    expect(snap.remaining).toBe(50);
    expect(snap.packConfigured).toBe(true);
  });

  it("zeroes access for free plan without trial", () => {
    const snap = buildContinuityUsage({
      plan: "free",
      trialEndsAt: null,
      used: 0,
      now,
    });
    // free is not a plan enum path for cloud access
    expect(snap.cloudAccess).toBe(false);
    expect(snap.limit).toBe(0);
  });

  it("trial uses five-run included quota", () => {
    const snap = buildContinuityUsage({
      plan: "trial",
      trialEndsAt: now + 86_400_000,
      used: 2,
      now,
    });
    expect(snap.cloudAccess).toBe(true);
    expect(snap.baseLimit).toBe(5);
    expect(snap.remaining).toBe(3);
  });
});
