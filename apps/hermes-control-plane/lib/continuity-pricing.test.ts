import { describe, expect, it } from "vitest";
import { AGENT_GOVERNANCE_LIMITS } from "./agent-governance";
import {
  CONTINUITY_PRICE_TIERS,
  buildContinuityUsageSnapshot,
  publicCloudRunLimitForPlan,
} from "./continuity-pricing";

describe("continuity-pricing (CoreWeave-style capacity truth)", () => {
  it("keeps public run caps identical to governance enforcement", () => {
    expect(publicCloudRunLimitForPlan("trial")).toBe(AGENT_GOVERNANCE_LIMITS.trialCloudTasksPer30Days);
    expect(publicCloudRunLimitForPlan("pro")).toBe(AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days);
    expect(publicCloudRunLimitForPlan("team")).toBe(AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days);
    expect(publicCloudRunLimitForPlan("free")).toBe(0);
  });

  it("exposes a transparent public tier matrix", () => {
    expect(CONTINUITY_PRICE_TIERS.some((t) => t.id === "pro" && t.fencedVps)).toBe(true);
    const trial = CONTINUITY_PRICE_TIERS.find((t) => t.id === "trial");
    expect(trial?.cloudRunsPer30Days).toBe(5);
    expect(trial?.trialDays).toBe(14);
  });

  it("computes remaining Continuity capacity without going negative", () => {
    const snap = buildContinuityUsageSnapshot({
      plan: "pro",
      cloudTasks30d: 97,
      activeTasks: 2,
    });
    expect(snap.cloudTaskLimit).toBe(100);
    expect(snap.cloudTasksRemaining).toBe(3);
    expect(snap.activeTasks).toBe(2);
    expect(
      buildContinuityUsageSnapshot({ plan: "trial", cloudTasks30d: 99, activeTasks: 0 }).cloudTasksRemaining,
    ).toBe(0);
  });
});
