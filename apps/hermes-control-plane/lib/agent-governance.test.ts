import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AGENT_GOVERNANCE_LIMITS,
  AGENT_GOVERNANCE_POLICY_VERSION,
  cloudTaskLimit,
  evaluateCloudContinuation,
  evaluateTaskAdmission,
  governanceAuditMetadata,
  governanceError,
} from "./agent-governance";

const now = 1_800_000_000_000;
const pro = { plan: "pro", trialEndsAt: null };

describe("versioned agent governance", () => {
  it("wires the same policy into admission, manual failover, and automatic claims", async () => {
    const [admission, failover, leases] = await Promise.all([
      readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/tasks/failover/route.ts", import.meta.url), "utf8"),
      readFile(new URL("./task-leases.ts", import.meta.url), "utf8"),
    ]);
    expect(admission).toContain("evaluateTaskAdmission");
    expect(admission).toContain('action: "task.policy.denied"');
    expect(failover).toContain("evaluateCloudContinuation");
    expect(failover).toContain("cloud_budget.created_at >= ?");
    expect(leases).toContain("evaluateCloudContinuation");
    expect(leases).toContain("Governance policy denied cloud execution");
    expect(leases).toContain("AGENT_GOVERNANCE_POLICY_VERSION");
  });

  it("keeps plan limits centralized and explicit", () => {
    expect(cloudTaskLimit("trial")).toBe(5);
    expect(cloudTaskLimit("pro")).toBe(100);
    expect(cloudTaskLimit("team")).toBe(100);
    expect(cloudTaskLimit("suspended")).toBe(0);
    expect(AGENT_GOVERNANCE_POLICY_VERSION).toBe("2026-07-22.1");
  });

  it("allows bounded local work without consuming a cloud continuation", () => {
    expect(evaluateTaskAdmission({
      organization: pro,
      route: "local",
      usage: { activeTasks: 2, dailyTasks: 12, cloudTasks: 99 },
      now,
    })).toMatchObject({ allowed: true, scope: "task", policyVersion: AGENT_GOVERNANCE_POLICY_VERSION });
  });

  it("fails closed at active and daily limits", () => {
    expect(evaluateTaskAdmission({
      organization: pro,
      route: "local",
      usage: { activeTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks, dailyTasks: 1 },
      now,
    })).toMatchObject({ allowed: false, code: "active_task_limit", status: 429 });
    expect(evaluateTaskAdmission({
      organization: pro,
      route: "blocked",
      usage: { activeTasks: 0, dailyTasks: AGENT_GOVERNANCE_LIMITS.maxDailyTasks },
      now,
    })).toMatchObject({ allowed: false, code: "daily_task_limit", status: 429 });
  });

  it("enforces entitlement and the projected 30-day cloud count", () => {
    expect(evaluateCloudContinuation({
      organization: { plan: "trial", trialEndsAt: now - 1 },
      cloudTasks: 0,
      cloudTaskDelta: 1,
      now,
    })).toMatchObject({ allowed: false, code: "cloud_entitlement_required", status: 402 });
    expect(evaluateCloudContinuation({ organization: pro, cloudTasks: 99, cloudTaskDelta: 1, now }))
      .toMatchObject({ allowed: true, limit: 100, observed: 100 });
    expect(evaluateCloudContinuation({ organization: pro, cloudTasks: 100, cloudTaskDelta: 1, now }))
      .toMatchObject({ allowed: false, code: "cloud_task_limit", limit: 100, observed: 101 });
    expect(evaluateCloudContinuation({ organization: pro, cloudTasks: 100, cloudTaskDelta: 0, now }))
      .toMatchObject({ allowed: true, limit: 100, observed: 100 });
  });

  it("emits bounded policy lineage and a machine-readable denial", async () => {
    const decision = evaluateCloudContinuation({ organization: pro, cloudTasks: 100, cloudTaskDelta: 1, now });
    expect(governanceAuditMetadata(decision, { stage: "manual_failover", route: "cloud" })).toEqual({
      policyVersion: AGENT_GOVERNANCE_POLICY_VERSION,
      decision: "deny",
      code: "cloud_task_limit",
      scope: "cloud",
      stage: "manual_failover",
      route: "cloud",
      limit: 100,
      observed: 101,
    });
    const response = governanceError(decision);
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "monthly cloud continuation limit reached",
      code: "cloud_task_limit",
      policyVersion: AGENT_GOVERNANCE_POLICY_VERSION,
    });
  });
});
