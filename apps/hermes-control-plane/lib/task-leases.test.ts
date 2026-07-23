import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(undefined),
  state: {
    existing: null as Record<string, unknown> | null,
    firsts: [] as Array<Record<string, unknown> | null>,
    changes: 1,
    runs: [] as Array<{ sql: string; args: unknown[] }>,
    selects: [] as Array<{ sql: string; args: unknown[] }>,
  },
}));

function statement(sql: string, args: unknown[] = []) {
  return {
    bind(...nextArgs: unknown[]) { return statement(sql, nextArgs); },
    async first() {
      mocks.state.selects.push({ sql, args });
      return mocks.state.firsts.length ? mocks.state.firsts.shift() : mocks.state.existing;
    },
    async all() { return { results: [] }; },
    async run() {
      mocks.state.runs.push({ sql, args });
      return { meta: { changes: mocks.state.changes } };
    },
  };
}

vi.mock("./runtime", () => ({
  db: () => ({
    prepare(sql: string) { return statement(sql); },
    async batch(items: Array<{ run: () => Promise<unknown> }>) {
      for (const item of items) await item.run();
      return items.map(() => ({ meta: { changes: mocks.state.changes } }));
    },
  }),
}));
vi.mock("./audit", () => ({ audit: mocks.audit }));
vi.mock("./security", () => ({
  randomToken: () => "lease-token",
  sha256: async (value: string) => `hash:${value}`,
}));

import { claimTask, completeTask, renewTask, TASK_LEASE_MS } from "./task-leases";

beforeEach(() => {
  mocks.state.existing = null;
  mocks.state.firsts = [];
  mocks.state.changes = 1;
  mocks.state.runs = [];
  mocks.state.selects = [];
  mocks.audit.mockClear();
  vi.restoreAllMocks();
});

describe("fenced task leases", () => {
  it("fails a cloud claim closed when entitlement expired and records policy lineage", async () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    mocks.state.firsts = [{
      id: "task-1",
      organizationId: "org-1",
      threadId: "thread-1",
      threadTitle: "Thread",
      prompt: "continue",
      currentRoute: "local",
      leaseGeneration: 0,
      sourceSessionId: "session-1",
      contextSnapshot: null,
      syncedAt: null,
      createdAt: 1_000,
      plan: "trial",
      trialEndsAt: 4_999,
      cloudTasks: 0,
    }];

    expect(await claimTask({ route: "cloud", owner: "cloud:runner-1" })).toBeNull();
    const denyRun = mocks.state.runs.find((run) => run.sql.includes("status = 'offline_blocked'"));
    expect(denyRun?.sql).toContain("status = 'offline_blocked', route = 'blocked'");
    expect(denyRun?.args[0]).toBe("Governance policy denied cloud execution: managed cloud continuation requires an active trial or subscription");
    expect(mocks.state.runs.some((run) => run.sql.includes("status = 'cloud_pending'"))).toBe(true);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "task.policy.denied",
      targetId: "task-1",
      metadata: expect.objectContaining({
        policyVersion: "2026-07-22.1",
        decision: "deny",
        code: "cloud_entitlement_required",
        stage: "automatic_claim",
      }),
    }));
  });

  it("allows an in-budget automatic claim and binds the budget check atomically", async () => {
    vi.spyOn(Date, "now").mockReturnValue(8_000);
    mocks.state.firsts = [{
      id: "task-2",
      organizationId: "org-1",
      threadId: "thread-1",
      threadTitle: "Thread",
      prompt: "continue",
      currentRoute: "local",
      leaseGeneration: 4,
      sourceSessionId: "session-1",
      contextSnapshot: null,
      syncedAt: null,
      createdAt: 7_000,
      plan: "pro",
      trialEndsAt: null,
      cloudTasks: 99,
    }];

    const claimed = await claimTask({ route: "cloud", owner: "cloud:runner-1" });
    expect(claimed?.task).toMatchObject({ id: "task-2", leaseGeneration: 5, leaseToken: "lease-token" });
    const leaseRun = mocks.state.runs.find((run) => run.sql.includes("cloud_budget.created_at >= ?"));
    expect(leaseRun?.sql).toContain("cloud_budget.created_at >= ?");
    expect(leaseRun?.args.at(-1)).toBe(100);
    expect(mocks.state.runs.some((run) => run.sql.includes("status = 'cloud_pending'"))).toBe(true);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "task.claim",
      metadata: expect.objectContaining({
        policyVersion: "2026-07-22.1",
        decision: "allow",
        observed: 100,
        stage: "automatic_claim",
      }),
    }));
  });

  it("lets cloud reclaim a task the Mac abandoned mid-execution, not just one never claimed locally", async () => {
    // Regression: previously the cloud claim query only matched status='local_pending'.
    // A task the Mac claimed and then went offline mid-run (status='running', expired
    // lease, lease_owner still set) could never be picked up by anyone but that same Mac
    // reconnecting — reclassifyStaleLocalTasks() above only sweeps lease_owner IS NULL rows,
    // so it can't reach this case either.
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    mocks.state.firsts = [{
      id: "task-abandoned",
      organizationId: "org-1",
      threadId: "thread-1",
      threadTitle: "Thread",
      prompt: "continue",
      currentRoute: "local",
      leaseGeneration: 1,
      sourceSessionId: "session-1",
      contextSnapshot: null,
      syncedAt: null,
      createdAt: 10_000,
      plan: "pro",
      trialEndsAt: null,
      cloudTasks: 0,
    }];

    const claimed = await claimTask({ route: "cloud", owner: "cloud:runner-1" });
    expect(claimed?.task).toMatchObject({ id: "task-abandoned", leaseGeneration: 2 });

    const select = mocks.state.selects.find((s) => s.sql.includes("k.status = 'running' AND d.failover_mode = 'auto'"));
    expect(select).toBeDefined();
    // cloudTasks 30-day window, then two staleness thresholds (local_pending clause,
    // running-recovery clause), then the trailing lease_expires_at check — all four
    // must bind positionally in the exact order their `?` placeholders appear in the SQL.
    expect(select!.args).toEqual([
      100_000 - 30 * 24 * 60 * 60 * 1000,
      100_000 - 60_000,
      100_000 - 60_000,
      100_000,
    ]);
  });

  it("renews only the current unexpired owner and records content-free metadata", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    mocks.state.existing = { organizationId: "org-1", route: "local", leaseGeneration: 7 };
    const renewed = await renewTask({
      owner: "device:device-1",
      taskId: "task-1",
      leaseToken: "secret-token",
      actorType: "device",
    });
    expect(renewed).toEqual({ leaseExpiresAt: 1_000 + TASK_LEASE_MS });
    expect(mocks.state.runs[0].sql).toContain("lease_expires_at > ?");
    expect(mocks.state.runs[0].args).toEqual([
      1_000 + TASK_LEASE_MS,
      1_000,
      "task-1",
      "device:device-1",
      "hash:secret-token",
      1_000,
    ]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "task.lease.renew",
      metadata: { route: "local", generation: 7, leaseExpiresAt: 1_000 + TASK_LEASE_MS },
    }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("secret-token");
  });

  it("refuses to revive an expired or stale lease", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000);
    mocks.state.existing = { organizationId: "org-1", route: "cloud", leaseGeneration: 2 };
    mocks.state.changes = 0;
    expect(await renewTask({
      owner: "cloud:runner-1",
      taskId: "task-1",
      leaseToken: "stale-token",
      actorType: "runner",
    })).toBeNull();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects completion after expiry, clears lease authority, and measures total task duration", async () => {
    vi.spyOn(Date, "now").mockReturnValue(4_000);
    mocks.state.existing = { organizationId: "org-1", route: "cloud", leaseGeneration: 3, createdAt: 1_500 };
    expect(await completeTask({
      owner: "cloud:runner-1",
      taskId: "task-1",
      leaseToken: "current-token",
      result: "private result",
      actorType: "runner",
    })).toBe(true);
    const update = mocks.state.runs[0];
    expect(update.sql).toContain("lease_owner = NULL, lease_token_hash = NULL, lease_expires_at = NULL");
    expect(update.sql).toContain("lease_expires_at > ?");
    expect(update.args.at(-1)).toBe(4_000);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "task.completed",
      metadata: { route: "cloud", generation: 3, durationMs: 2_500 },
    }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("private result");
  });
});
