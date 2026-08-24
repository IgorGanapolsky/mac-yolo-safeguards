import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(undefined),
  state: {
    existing: null as Record<string, unknown> | null,
    firsts: [] as Array<Record<string, unknown> | null>,
    changes: 1,
    allResults: [] as Array<Record<string, unknown>>,
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
    async all() { return { results: mocks.state.allResults }; },
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
  mocks.state.allResults = [];
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

  it("expands an exact continuation command for execution while preserving display copy", async () => {
    vi.spyOn(Date, "now").mockReturnValue(9_000);
    mocks.state.firsts = [{
      id: "task-receipts",
      organizationId: "org-1",
      threadId: "thread-1",
      threadTitle: "Thread",
      prompt: "show receipts",
      currentRoute: "cloud",
      leaseGeneration: 0,
      sourceSessionId: "session-1",
      contextSnapshot: null,
      syncedAt: null,
      createdAt: 8_000,
      plan: "pro",
      trialEndsAt: null,
      cloudTasks: 1,
    }];
    mocks.state.allResults = [{
      prompt: "We shipped the change",
      result: "It is live",
      createdAt: 7_000,
    }];

    const claimed = await claimTask({ route: "cloud", owner: "cloud:runner-1" });
    expect(claimed?.task).toMatchObject({
      id: "task-receipts",
      displayPrompt: "show receipts",
      continuationCommand: "show_receipts",
    });
    expect(claimed?.task.prompt).toMatch(/Audit the claims/i);
    expect(claimed?.task.prompt).toMatch(/provider record/i);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "task.claim",
      metadata: expect.objectContaining({
        continuationCommand: "show_receipts",
        continuationApplied: true,
      }),
    }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("We shipped the change");
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("It is live");
  });

  it("does not let chained continuation commands hide an earlier local-only request", async () => {
    vi.spyOn(Date, "now").mockReturnValue(9_500);
    mocks.state.firsts = [{
      id: "task-local-receipts",
      organizationId: "org-1",
      threadId: "thread-1",
      threadTitle: "Thread",
      prompt: "keep going",
      currentRoute: "cloud",
      leaseGeneration: 0,
      sourceSessionId: "session-1",
      contextSnapshot: null,
      syncedAt: null,
      createdAt: 9_000,
      plan: "pro",
      trialEndsAt: null,
      cloudTasks: 1,
    }];
    mocks.state.allResults = [
      {
        prompt: "Delete /Users/igor/Desktop/private.txt",
        result: "That requires the local machine",
        createdAt: 7_000,
      },
      {
        prompt: "keep going",
        result: "Still requires the local machine",
        createdAt: 8_000,
      },
    ];

    expect(await claimTask({ route: "cloud", owner: "cloud:runner-1" })).toBeNull();
    const blocked = mocks.state.runs.find((run) => run.sql.includes("status = 'offline_blocked'"));
    expect(blocked?.args[0]).toMatch(/fenced VPS/i);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "task.policy.denied",
      metadata: expect.objectContaining({ matched: "local_filesystem_path" }),
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
      metadata: expect.objectContaining({
        route: "cloud",
        generation: 3,
        durationMs: 2_500,
        receipt: expect.objectContaining({
          outcome: "claimed_done",
          verb: "task.complete.cloud",
          note: "self_reported_only",
        }),
      }),
    }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("private result");
  });

  it("persists a successful reset result as a durable same-thread compaction marker", async () => {
    vi.spyOn(Date, "now").mockReturnValue(4_500);
    mocks.state.existing = {
      organizationId: "org-1",
      route: "cloud",
      leaseGeneration: 4,
      createdAt: 2_000,
      threadId: "thread-1",
      prompt: "/reset",
    };
    expect(await completeTask({
      owner: "cloud:runner-1",
      taskId: "task-reset",
      leaseToken: "current-token",
      result: "Decision: keep one persistent bot thread. Next: finish the release.",
      actorType: "runner",
    })).toBe(true);

    expect(mocks.state.runs.some((run) => run.sql.includes("context_snapshot = ?"))).toBe(false);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "thread.context.compacted",
      targetId: "thread-1",
      metadata: {
        route: "cloud",
        command: "compact_same_thread",
        taskId: "task-reset",
        durableMarker: "completed_task_result",
      },
    }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("finish the release");
  });

  it("uses the latest durable reset result instead of the pre-compaction snapshot", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    mocks.state.firsts = [{
      id: "task-after-reset",
      organizationId: "org-1",
      threadId: "thread-1",
      threadTitle: "Thread",
      prompt: "keep going",
      currentRoute: "cloud",
      leaseGeneration: 0,
      sourceSessionId: "session-1",
      contextSnapshot: JSON.stringify([
        { role: "user", content: "obsolete plan that must leave model context" },
        { role: "assistant", content: "obsolete answer" },
      ]),
      syncedAt: null,
      createdAt: 9_000,
      plan: "pro",
      trialEndsAt: null,
      cloudTasks: 1,
    }];
    mocks.state.allResults = [{
      id: "task-reset",
      prompt: "/reset",
      result: "Durable summary: ship the verified Bot Mode integration.",
      createdAt: 8_000,
    }];

    const claimed = await claimTask({ route: "cloud", owner: "cloud:runner-1" });
    expect(claimed?.task.contextMessages).toEqual([
      { role: "user", content: "/reset" },
      { role: "assistant", content: "Durable summary: ship the verified Bot Mode integration." },
    ]);
    expect(JSON.stringify(claimed?.task.contextMessages)).not.toContain("obsolete plan");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "task.claim",
      metadata: expect.objectContaining({ contextCompactedFromTaskId: "task-reset" }),
    }));
  });

  it("does not compact durable context when a reset task fails", async () => {
    vi.spyOn(Date, "now").mockReturnValue(4_600);
    mocks.state.existing = {
      organizationId: "org-1",
      route: "cloud",
      leaseGeneration: 5,
      createdAt: 2_100,
      threadId: "thread-1",
      prompt: "/new",
    };
    expect(await completeTask({
      owner: "cloud:runner-1",
      taskId: "task-reset-failed",
      leaseToken: "current-token",
      error: "provider failed",
      actorType: "runner",
    })).toBe(true);
    expect(mocks.state.runs.some((run) => run.sql.includes("context_snapshot = ?"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalledWith(expect.objectContaining({ action: "thread.context.compacted" }));
  });

  it("maps raw z.ai quota text before storing task.error", async () => {
    vi.spyOn(Date, "now").mockReturnValue(4_000);
    mocks.state.existing = { organizationId: "org-1", route: "cloud", leaseGeneration: 3, createdAt: 1_500 };
    const raw = "Weekly/Monthly Limit Exhausted. Your limit will reset at 2026-08-22 21:07:02";
    expect(await completeTask({
      owner: "cloud:runner-1",
      taskId: "task-1",
      leaseToken: "current-token",
      error: raw,
      actorType: "runner",
    })).toBe(true);
    const update = mocks.state.runs[0];
    expect(update.args[2]).toBe(
      "Hosted model quota is exhausted until 2026-08-22 21:07:02 UTC. The runner is up; the model is not ready.",
    );
    expect(update.args[2]).not.toBe(raw);
  });

});
