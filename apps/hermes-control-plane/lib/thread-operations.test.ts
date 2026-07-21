import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  thread: Record<string, unknown> | null;
  clearRows: Array<Record<string, unknown>>;
  claim: Record<string, unknown> | null;
  current: Record<string, unknown> | null;
  batches: Array<Array<{ sql: string; args: unknown[] }>>;
  runs: Array<{ sql: string; args: unknown[] }>;
} = { thread: null, clearRows: [], claim: null, current: null, batches: [], runs: [] };

function statement(sql: string, args: unknown[] = []) {
  return {
    sql,
    args,
    bind(...nextArgs: unknown[]) { return statement(sql, nextArgs); },
    async first() {
      if (sql.includes("LOWER(COALESCE")) return null;
      if (sql.includes("FROM threads WHERE id")) return state.thread;
      if (sql.includes("FROM thread_operations") && sql.includes("status IN")) return state.claim;
      if (sql.includes("FROM thread_operations WHERE id")) return state.current;
      return null;
    },
    async all() {
      if (sql.includes("FROM threads WHERE organization_id")) return { results: state.clearRows };
      return { results: [] };
    },
    async run() {
      state.runs.push({ sql, args });
      return { meta: { changes: 1 } };
    },
  };
}

vi.mock("./runtime", () => ({
  db: () => ({
    prepare(sql: string) { return statement(sql); },
    async batch(statements: Array<{ sql: string; args: unknown[] }>) {
      state.batches.push(statements.map((item) => ({ sql: item.sql, args: item.args })));
    },
  }),
}));
vi.mock("./audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./security", () => ({ randomToken: () => "lease-token", sha256: async (value: string) => `hash:${value}` }));

import {
  claimThreadOperation,
  cleanThreadTitle,
  clearThreads,
  completeThreadOperation,
  deleteThread,
  renameThread,
} from "./thread-operations";

beforeEach(() => {
  state.thread = null;
  state.clearRows = [];
  state.claim = null;
  state.current = null;
  state.batches = [];
  state.runs = [];
});

describe("thread operations", () => {
  it("normalizes and bounds chat titles", () => {
    expect(cleanThreadTitle("  Revenue\n\tplan  ")).toBe("Revenue plan");
    expect(cleanThreadTitle("x".repeat(140))).toHaveLength(120);
    expect(cleanThreadTitle(null)).toBe("");
  });

  it("persists a rename override and queues the paired Hermes mutation", async () => {
    state.thread = { id: "thread-1", deviceId: "device-1", sourceSessionId: "session-1", deletedAt: null };
    const result = await renameThread({ organizationId: "org-1", userId: "user-1", threadId: "thread-1", title: " New title " });
    expect(result.title).toBe("New title");
    expect(result.operationId).toBeTruthy();
    expect(state.batches[0].some((item) => item.sql.includes("UPDATE threads SET title_override"))).toBe(true);
    const queued = state.batches[0].find((item) => item.sql.includes("INSERT INTO thread_operations"));
    expect(queued?.args).toContain("rename");
    expect(queued?.args).toContain("session-1");
  });

  it("tombstones one chat and queues an exact-session delete", async () => {
    state.thread = { id: "thread-1", deviceId: "device-1", sourceSessionId: "session-1", deletedAt: null };
    const result = await deleteThread({ organizationId: "org-1", userId: "user-1", threadId: "thread-1" });
    expect(result.operationId).toBeTruthy();
    expect(state.batches[0].some((item) => item.sql.includes("deleted_at"))).toBe(true);
    expect(state.batches[0].find((item) => item.sql.includes("INSERT INTO thread_operations"))?.args).toContain("delete");
  });

  it("clear all queues one bulk operation per paired device", async () => {
    state.clearRows = [
      { id: "thread-1", deviceId: "device-1", sourceSessionId: "session-1" },
      { id: "thread-2", deviceId: "device-1", sourceSessionId: "session-2" },
      { id: "thread-3", deviceId: "device-2", sourceSessionId: "session-3" },
    ];
    const result = await clearThreads({ organizationId: "org-1", userId: "user-1" });
    expect(result).toMatchObject({ cleared: 3 });
    expect(result.operationIds).toHaveLength(2);
    expect(state.batches[0].filter((item) => item.sql.includes("INSERT INTO thread_operations"))).toHaveLength(2);
  });

  it("leases an operation and retries a transient gateway failure", async () => {
    state.claim = {
      id: "op-1", organizationId: "org-1", deviceId: "device-1", threadId: "thread-1",
      sourceSessionId: "session-1", operation: "rename", title: "Title", leaseGeneration: 0,
    };
    const claimed = await claimThreadOperation({ owner: "device:device-1", deviceId: "device-1" });
    expect(claimed?.operation).toMatchObject({ id: "op-1", leaseToken: "lease-token", leaseGeneration: 1 });
    state.current = { organizationId: "org-1", operation: "rename", leaseGeneration: 1 };
    expect(await completeThreadOperation({ owner: "device:device-1", deviceId: "device-1", operationId: "op-1", leaseToken: "lease-token", error: "offline" })).toBe(true);
    expect(state.runs.at(-1)?.args[0]).toBe("pending");
  });
});
