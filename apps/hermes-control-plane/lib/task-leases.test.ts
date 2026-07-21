import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(undefined),
  state: {
    existing: null as Record<string, unknown> | null,
    changes: 1,
    runs: [] as Array<{ sql: string; args: unknown[] }>,
  },
}));

function statement(sql: string, args: unknown[] = []) {
  return {
    bind(...nextArgs: unknown[]) { return statement(sql, nextArgs); },
    async first() { return mocks.state.existing; },
    async all() { return { results: [] }; },
    async run() {
      mocks.state.runs.push({ sql, args });
      return { meta: { changes: mocks.state.changes } };
    },
  };
}

vi.mock("./runtime", () => ({
  db: () => ({ prepare(sql: string) { return statement(sql); } }),
}));
vi.mock("./audit", () => ({ audit: mocks.audit }));
vi.mock("./security", () => ({
  randomToken: () => "lease-token",
  sha256: async (value: string) => `hash:${value}`,
}));

import { completeTask, renewTask, TASK_LEASE_MS } from "./task-leases";

beforeEach(() => {
  mocks.state.existing = null;
  mocks.state.changes = 1;
  mocks.state.runs = [];
  mocks.audit.mockClear();
  vi.restoreAllMocks();
});

describe("fenced task leases", () => {
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
