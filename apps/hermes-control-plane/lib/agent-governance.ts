import { hasCloudContinuationAccess, hasLocalControlAccess } from "./entitlements";

export const AGENT_GOVERNANCE_POLICY_VERSION = "2026-07-22.1";
export const AGENT_GOVERNANCE_LIMITS = Object.freeze({
  maxActiveTasks: 10,
  maxDailyTasks: 250,
  trialCloudTasksPer30Days: 5,
  paidCloudTasksPer30Days: 100,
});

export interface GovernanceOrganization {
  plan: string;
  trialEndsAt: number | null;
}

export interface TaskUsage {
  activeTasks: number;
  dailyTasks: number;
  cloudTasks: number;
}

export type GovernanceDenialCode =
  | "workspace_suspended"
  | "active_task_limit"
  | "daily_task_limit"
  | "cloud_entitlement_required"
  | "cloud_task_limit";

export type GovernanceDecision =
  | {
      allowed: true;
      policyVersion: string;
      scope: "task" | "cloud";
      limit: number | null;
      observed: number | null;
    }
  | {
      allowed: false;
      policyVersion: string;
      scope: "task" | "cloud";
      code: GovernanceDenialCode;
      message: string;
      status: number;
      limit: number | null;
      observed: number | null;
    };

function safeCount(value: number | null | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
}

export function cloudTaskLimit(plan: string): number {
  if (plan === "trial") return AGENT_GOVERNANCE_LIMITS.trialCloudTasksPer30Days;
  if (plan === "pro" || plan === "team") return AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days;
  return 0;
}

function allow(scope: "task" | "cloud", limit: number | null = null, observed: number | null = null): GovernanceDecision {
  return { allowed: true, policyVersion: AGENT_GOVERNANCE_POLICY_VERSION, scope, limit, observed };
}

function deny(
  scope: "task" | "cloud",
  code: GovernanceDenialCode,
  message: string,
  status: number,
  limit: number | null = null,
  observed: number | null = null,
): GovernanceDecision {
  return { allowed: false, policyVersion: AGENT_GOVERNANCE_POLICY_VERSION, scope, code, message, status, limit, observed };
}

export function evaluateCloudContinuation(input: {
  organization: GovernanceOrganization;
  cloudTasks: number | null | undefined;
  cloudTaskDelta: 0 | 1;
  /** Extra Continuity runs from pack purchases. */
  cloudTaskBonus?: number | null;
  now?: number;
}): GovernanceDecision {
  if (!hasCloudContinuationAccess(input.organization, input.now)) {
    return deny("cloud", "cloud_entitlement_required", "managed cloud continuation requires an active trial or subscription", 402);
  }
  const limit = cloudTaskLimit(input.organization.plan) + safeCount(input.cloudTaskBonus);
  const projected = safeCount(input.cloudTasks) + input.cloudTaskDelta;
  if (projected > limit) {
    return deny(
      "cloud",
      "cloud_task_limit",
      input.organization.plan === "trial"
        ? "trial Continuity run limit reached — upgrade or buy a run pack"
        : "included Continuity runs used up — buy a run pack or wait for the next 30-day window",
      429,
      limit,
      projected,
    );
  }
  return allow("cloud", limit, projected);
}

export function evaluateTaskAdmission(input: {
  organization: GovernanceOrganization;
  route: "local" | "cloud" | "blocked";
  usage: Partial<TaskUsage>;
  cloudTaskBonus?: number | null;
  now?: number;
}): GovernanceDecision {
  if (!hasLocalControlAccess(input.organization.plan)) {
    return deny("task", "workspace_suspended", "this workspace is suspended", 402);
  }
  const activeTasks = safeCount(input.usage.activeTasks);
  if (activeTasks >= AGENT_GOVERNANCE_LIMITS.maxActiveTasks) {
    return deny("task", "active_task_limit", "finish an active task before starting another", 429,
      AGENT_GOVERNANCE_LIMITS.maxActiveTasks, activeTasks);
  }
  const dailyTasks = safeCount(input.usage.dailyTasks);
  if (dailyTasks >= AGENT_GOVERNANCE_LIMITS.maxDailyTasks) {
    return deny("task", "daily_task_limit", "daily task safety limit reached", 429,
      AGENT_GOVERNANCE_LIMITS.maxDailyTasks, dailyTasks);
  }
  if (input.route === "cloud") {
    return evaluateCloudContinuation({
      organization: input.organization,
      cloudTasks: input.usage.cloudTasks,
      cloudTaskDelta: 1,
      cloudTaskBonus: input.cloudTaskBonus,
      now: input.now,
    });
  }
  return allow("task");
}

export function governanceAuditMetadata(
  decision: GovernanceDecision,
  input: { stage: "admission" | "manual_failover" | "automatic_claim"; route: "local" | "cloud" | "blocked" },
): Record<string, string | number | boolean | null> {
  return {
    policyVersion: decision.policyVersion,
    decision: decision.allowed ? "allow" : "deny",
    code: decision.allowed ? null : decision.code,
    scope: decision.scope,
    stage: input.stage,
    route: input.route,
    limit: decision.limit,
    observed: decision.observed,
  };
}

export function governanceError(decision: GovernanceDecision): Response {
  if (decision.allowed) throw new Error("Cannot render an allow decision as an error");
  return Response.json({
    error: decision.message,
    code: decision.code,
    policyVersion: decision.policyVersion,
  }, { status: decision.status, headers: { "cache-control": "no-store" } });
}
