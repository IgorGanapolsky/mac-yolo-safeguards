/**
 * Public Continuity capacity truth (CoreWeave-style transparent caps).
 * Values mirror agent-governance enforcement — never invent higher limits here.
 *
 * Steals high-ROI product patterns from https://www.coreweave.com/pricing:
 * - Public capacity matrix (not hidden in sales decks)
 * - On-demand vs reserved purchase modes
 * - Spot/batch analog = local $0 paired runs (no Continuity quota)
 * - Free egress / no surprise fees as explicit trust copy
 * - Live remaining capacity after sign-in
 */
import { AGENT_GOVERNANCE_LIMITS, cloudTaskLimit } from "./agent-governance";

export type ContinuityPriceTierId = "free" | "trial" | "pro" | "team";

export type ContinuityPriceTier = {
  id: ContinuityPriceTierId;
  /** CoreWeave analog: free start / short trial / on-demand commit / reserved */
  purchaseMode: "free" | "trial" | "on_demand_monthly" | "reserved_contact";
  purchaseModeLabel: string;
  label: string;
  cloudRunsPer30Days: number;
  /** Display override when contract can exceed governance floor (Team). */
  cloudRunsDisplay: string;
  maxActiveTasks: number;
  maxActiveTasksDisplay: string;
  maxDailyTasks: number;
  fencedVps: boolean;
  renewableLeases: boolean;
  judgeGates: "policy_only" | "standard" | "custom";
  trialDays: number | null;
  macPairRequired: false;
};

/** Public matrix for landing + dashboard. Keep in sync with AGENT_GOVERNANCE_LIMITS. */
export const CONTINUITY_PRICE_TIERS: readonly ContinuityPriceTier[] = Object.freeze([
  {
    id: "free",
    purchaseMode: "free",
    purchaseModeLabel: "Free start",
    label: "Sign-in workspace",
    cloudRunsPer30Days: 0,
    cloudRunsDisplay: "0",
    maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    maxActiveTasksDisplay: String(AGENT_GOVERNANCE_LIMITS.maxActiveTasks),
    maxDailyTasks: AGENT_GOVERNANCE_LIMITS.maxDailyTasks,
    fencedVps: false,
    renewableLeases: false,
    judgeGates: "policy_only",
    trialDays: null,
    macPairRequired: false,
  },
  {
    id: "trial",
    purchaseMode: "trial",
    purchaseModeLabel: "14-day trial",
    label: "Continuity trial",
    cloudRunsPer30Days: AGENT_GOVERNANCE_LIMITS.trialCloudTasksPer30Days,
    cloudRunsDisplay: String(AGENT_GOVERNANCE_LIMITS.trialCloudTasksPer30Days),
    maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    maxActiveTasksDisplay: String(AGENT_GOVERNANCE_LIMITS.maxActiveTasks),
    maxDailyTasks: AGENT_GOVERNANCE_LIMITS.maxDailyTasks,
    fencedVps: true,
    renewableLeases: true,
    judgeGates: "standard",
    trialDays: 14,
    macPairRequired: false,
  },
  {
    id: "pro",
    purchaseMode: "on_demand_monthly",
    purchaseModeLabel: "On-demand / mo",
    label: "Pro Continuity",
    cloudRunsPer30Days: AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days,
    cloudRunsDisplay: String(AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days),
    maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    maxActiveTasksDisplay: String(AGENT_GOVERNANCE_LIMITS.maxActiveTasks),
    maxDailyTasks: AGENT_GOVERNANCE_LIMITS.maxDailyTasks,
    fencedVps: true,
    renewableLeases: true,
    judgeGates: "standard",
    trialDays: 14,
    macPairRequired: false,
  },
  {
    id: "team",
    purchaseMode: "reserved_contact",
    purchaseModeLabel: "Reserved",
    label: "Team & Enterprise",
    // Same hard floor as Pro until a separate team limit is wired in governance.
    cloudRunsPer30Days: AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days,
    cloudRunsDisplay: `${AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days}+`,
    maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    maxActiveTasksDisplay: `${AGENT_GOVERNANCE_LIMITS.maxActiveTasks}+`,
    maxDailyTasks: AGENT_GOVERNANCE_LIMITS.maxDailyTasks,
    fencedVps: true,
    renewableLeases: true,
    judgeGates: "custom",
    trialDays: null,
    macPairRequired: false,
  },
]);

/**
 * CoreWeave-style execution economics mapped to Continuity product reality:
 * on-demand VPS, local "spot" (zero Continuity quota), reserved Team.
 */
export const CONTINUITY_EXECUTION_MODES = Object.freeze([
  {
    id: "on_demand" as const,
    label: "On-demand Continuity",
    priceHint: "Counts 1:1 against plan VPS run caps",
    bestFor: "Interactive chats, live computer-use, phone-driven work",
    priority: "Interactive",
  },
  {
    id: "local_spot" as const,
    label: "Local / paired machine",
    priceHint: "$0 Continuity runs · does not spend VPS quota",
    bestFor: "Batch sweeps, Mac-side jobs, offline-safe work",
    priority: "Spot / batch",
  },
  {
    id: "reserved" as const,
    label: "Reserved Team capacity",
    priceHint: "Contract caps · custom judge rubrics",
    bestFor: "Guaranteed throughput and multi-seat workspaces",
    priority: "Reserved",
  },
]);

/** CoreWeave "egress free" trust framing for Continuity (plan caps only). */
export const CONTINUITY_ZERO_EGRESS = Object.freeze({
  dataTransfer: "Free",
  idleFees: "None",
  surpriseEgress: "None",
  billingModel: "Plan caps only — enforced in control plane",
  footnote:
    "No per-GB egress, NAT, or idle-instance fees. You pay the plan; the enforcer stops runs at the cap.",
});

export function publicCloudRunLimitForPlan(plan: string): number {
  return cloudTaskLimit(plan);
}

export function purchaseModeForPlan(plan: string): ContinuityPriceTier["purchaseMode"] {
  if (plan === "trial") return "trial";
  if (plan === "pro") return "on_demand_monthly";
  if (plan === "team") return "reserved_contact";
  return "free";
}

export type ContinuityUsageSnapshot = {
  cloudTasks30d: number;
  cloudTaskLimit: number;
  cloudTasksRemaining: number;
  activeTasks: number;
  maxActiveTasks: number;
  plan: string;
  purchaseMode: ContinuityPriceTier["purchaseMode"];
  windowDays: 30;
  percentUsed: number;
  exhausted: boolean;
  upgradeHint: string | null;
};

export function buildContinuityUsageSnapshot(input: {
  plan: string;
  cloudTasks30d: number | null | undefined;
  activeTasks: number | null | undefined;
}): ContinuityUsageSnapshot {
  const cloudTasks30d = Math.max(0, Math.floor(Number(input.cloudTasks30d) || 0));
  const activeTasks = Math.max(0, Math.floor(Number(input.activeTasks) || 0));
  const limit = publicCloudRunLimitForPlan(input.plan);
  const remaining = Math.max(0, limit - cloudTasks30d);
  const percentUsed =
    limit > 0 ? Math.min(100, Math.round((cloudTasks30d / limit) * 100)) : cloudTasks30d > 0 ? 100 : 0;
  // Free / no-quota plans are exhausted for cloud runs; paid at remaining 0 likewise.
  const exhausted = remaining === 0;
  let upgradeHint: string | null = null;
  if (input.plan === "free" || limit === 0) {
    upgradeHint = "Start a Continuity trial or Pro plan to unlock fenced VPS runs.";
  } else if (exhausted) {
    upgradeHint =
      input.plan === "trial"
        ? "Trial Continuity cap reached — upgrade to Pro for 100 runs / 30 days."
        : "Monthly Continuity cap reached — contact Team for reserved capacity or wait for the window to roll.";
  } else if (remaining <= Math.max(1, Math.floor(limit * 0.1))) {
    upgradeHint = `Only ${remaining} Continuity run${remaining === 1 ? "" : "s"} left in this 30-day window.`;
  }

  return {
    cloudTasks30d,
    cloudTaskLimit: limit,
    cloudTasksRemaining: remaining,
    activeTasks,
    maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    plan: input.plan,
    purchaseMode: purchaseModeForPlan(input.plan),
    windowDays: 30,
    percentUsed,
    exhausted,
    upgradeHint,
  };
}

export function capacityMatrixColumns(): ContinuityPriceTier[] {
  return [...CONTINUITY_PRICE_TIERS];
}

export function judgeGatesLabel(value: ContinuityPriceTier["judgeGates"]): string {
  if (value === "policy_only") return "Policy only";
  if (value === "custom") return "Custom";
  return "✓";
}
