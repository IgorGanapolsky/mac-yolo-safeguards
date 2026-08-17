/**
 * Public Continuity capacity truth (CoreWeave-style transparent caps).
 * Values mirror agent-governance enforcement — never invent higher limits here.
 */
import { AGENT_GOVERNANCE_LIMITS, cloudTaskLimit } from "./agent-governance";

export type ContinuityPriceTierId = "free" | "trial" | "pro" | "team";

export type ContinuityPriceTier = {
  id: ContinuityPriceTierId;
  /** CoreWeave analog: free start / short trial / on-demand commit / reserved */
  purchaseMode: "free" | "trial" | "on_demand_monthly" | "reserved_contact";
  label: string;
  cloudRunsPer30Days: number;
  maxActiveTasks: number;
  maxDailyTasks: number;
  fencedVps: boolean;
  renewableLeases: boolean;
  judgeGates: boolean;
  trialDays: number | null;
};

/** Public matrix for landing + dashboard. Keep in sync with AGENT_GOVERNANCE_LIMITS. */
export const CONTINUITY_PRICE_TIERS: readonly ContinuityPriceTier[] = Object.freeze([
  {
    id: "free",
    purchaseMode: "free",
    label: "Sign-in workspace",
    cloudRunsPer30Days: 0,
    maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    maxDailyTasks: AGENT_GOVERNANCE_LIMITS.maxDailyTasks,
    fencedVps: false,
    renewableLeases: false,
    judgeGates: true,
    trialDays: null,
  },
  {
    id: "trial",
    purchaseMode: "trial",
    label: "Continuity trial",
    cloudRunsPer30Days: AGENT_GOVERNANCE_LIMITS.trialCloudTasksPer30Days,
    maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    maxDailyTasks: AGENT_GOVERNANCE_LIMITS.maxDailyTasks,
    fencedVps: true,
    renewableLeases: true,
    judgeGates: true,
    trialDays: 14,
  },
  {
    id: "pro",
    purchaseMode: "on_demand_monthly",
    label: "Pro Continuity",
    cloudRunsPer30Days: AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days,
    maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    maxDailyTasks: AGENT_GOVERNANCE_LIMITS.maxDailyTasks,
    fencedVps: true,
    renewableLeases: true,
    judgeGates: true,
    trialDays: 14,
  },
  {
    id: "team",
    purchaseMode: "reserved_contact",
    label: "Team & Enterprise",
    // Same hard cap as Pro until a separate team limit is wired in governance.
    cloudRunsPer30Days: AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days,
    maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    maxDailyTasks: AGENT_GOVERNANCE_LIMITS.maxDailyTasks,
    fencedVps: true,
    renewableLeases: true,
    judgeGates: true,
    trialDays: null,
  },
]);

export function publicCloudRunLimitForPlan(plan: string): number {
  return cloudTaskLimit(plan);
}

export type ContinuityUsageSnapshot = {
  cloudTasks30d: number;
  cloudTaskLimit: number;
  cloudTasksRemaining: number;
  activeTasks: number;
  maxActiveTasks: number;
  plan: string;
  windowDays: 30;
};

export function buildContinuityUsageSnapshot(input: {
  plan: string;
  cloudTasks30d: number | null | undefined;
  activeTasks: number | null | undefined;
}): ContinuityUsageSnapshot {
  const cloudTasks30d = Math.max(0, Math.floor(Number(input.cloudTasks30d) || 0));
  const activeTasks = Math.max(0, Math.floor(Number(input.activeTasks) || 0));
  const limit = publicCloudRunLimitForPlan(input.plan);
  return {
    cloudTasks30d,
    cloudTaskLimit: limit,
    cloudTasksRemaining: Math.max(0, limit - cloudTasks30d),
    activeTasks,
    maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    plan: input.plan,
    windowDays: 30,
  };
}
