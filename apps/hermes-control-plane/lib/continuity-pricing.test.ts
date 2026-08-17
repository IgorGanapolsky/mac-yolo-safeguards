import { describe, expect, it } from "vitest";
import { AGENT_GOVERNANCE_LIMITS } from "./agent-governance";
import {
  CONTINUITY_EXECUTION_MODES,
  CONTINUITY_PRICE_TIERS,
  CONTINUITY_ZERO_EGRESS,
  buildContinuityUsageSnapshot,
  capacityMatrixColumns,
  publicCloudRunLimitForPlan,
  purchaseModeForPlan,
} from "./continuity-pricing";

describe("continuity-pricing (CoreWeave-style capacity truth)", () => {
  it("keeps public run caps identical to governance enforcement", () => {
    expect(publicCloudRunLimitForPlan("trial")).toBe(AGENT_GOVERNANCE_LIMITS.trialCloudTasksPer30Days);
    expect(publicCloudRunLimitForPlan("pro")).toBe(AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days);
    expect(publicCloudRunLimitForPlan("team")).toBe(AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days);
    expect(publicCloudRunLimitForPlan("free")).toBe(0);
  });

  it("exposes a transparent public tier matrix from governance numbers", () => {
    const cols = capacityMatrixColumns();
    expect(cols).toHaveLength(4);
    expect(CONTINUITY_PRICE_TIERS.some((t) => t.id === "pro" && t.fencedVps)).toBe(true);
    const trial = CONTINUITY_PRICE_TIERS.find((t) => t.id === "trial");
    expect(trial?.cloudRunsPer30Days).toBe(5);
    expect(trial?.cloudRunsDisplay).toBe("5");
    expect(trial?.trialDays).toBe(14);
    expect(trial?.macPairRequired).toBe(false);
    const pro = CONTINUITY_PRICE_TIERS.find((t) => t.id === "pro");
    expect(pro?.cloudRunsDisplay).toBe("100");
    expect(pro?.purchaseMode).toBe("on_demand_monthly");
  });

  it("maps CoreWeave execution modes to Continuity product rails", () => {
    expect(CONTINUITY_EXECUTION_MODES.map((m) => m.id)).toEqual([
      "on_demand",
      "local_spot",
      "reserved",
    ]);
    expect(CONTINUITY_EXECUTION_MODES.find((m) => m.id === "local_spot")?.priceHint).toMatch(/\$0/);
    expect(CONTINUITY_ZERO_EGRESS.surpriseEgress).toBe("None");
    expect(CONTINUITY_ZERO_EGRESS.dataTransfer).toBe("Free");
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
    expect(snap.percentUsed).toBe(97);
    expect(snap.exhausted).toBe(false);
    expect(snap.purchaseMode).toBe("on_demand_monthly");
    expect(snap.upgradeHint).toMatch(/Only 3/);
    expect(
      buildContinuityUsageSnapshot({ plan: "trial", cloudTasks30d: 99, activeTasks: 0 }).cloudTasksRemaining,
    ).toBe(0);
    expect(
      buildContinuityUsageSnapshot({ plan: "trial", cloudTasks30d: 5, activeTasks: 0 }),
    ).toMatchObject({ exhausted: true, percentUsed: 100 });
  });

  it("marks free plan cloud capacity exhausted with an upgrade hint", () => {
    const free = buildContinuityUsageSnapshot({ plan: "free", cloudTasks30d: 0, activeTasks: 0 });
    expect(free.cloudTaskLimit).toBe(0);
    expect(free.exhausted).toBe(true);
    expect(free.upgradeHint).toMatch(/trial or Pro/i);
    expect(purchaseModeForPlan("team")).toBe("reserved_contact");
  });
});
