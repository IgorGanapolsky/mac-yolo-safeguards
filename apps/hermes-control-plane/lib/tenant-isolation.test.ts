import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cross-tenant isolation.
 *
 * thumbgate.app tells every visitor "Your workspace is private." As of 2026-07-31
 * that claim had 24 files of `organizationId` scoping behind it and ZERO tests
 * asserting a second organization cannot reach the first one's data.
 *
 * The pre-existing `thread-operations.test.ts` cannot cover this: its fake `db()`
 * returns `state.thread` for any `FROM threads WHERE id` query and ignores the bound
 * arguments entirely. Under that mock, deleting `AND organization_id = ?` from the
 * query still passes every test.
 *
 * So this file's fake DB is deliberately different in two ways:
 *   1. It is TENANT-AWARE — rows are stored per organization and a SELECT only
 *      returns a row when the bound organization matches.
 *   2. It FAILS LOUDLY if a threads query omits `organization_id` from its WHERE
 *      clause, so removing the predicate breaks the test even where the fake would
 *      otherwise have returned nothing.
 *
 * (2) matters more than (1): a tenant-aware fake proves today's code is scoped, but
 * only the SQL assertion catches the regression where someone drops the predicate.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const THREAD_IN_A = "thread_owned_by_alpha";

type ThreadRow = {
  id: string;
  organizationId: string;
  deviceId: string | null;
  sourceSessionId: string | null;
  deletedAt: number | null;
};

const state: {
  threads: ThreadRow[];
  writes: Array<{ sql: string; args: unknown[] }>;
  unscopedThreadQueries: string[];
} = { threads: [], writes: [], unscopedThreadQueries: [] };

function normalize(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/** A threads query that forgets the tenant predicate is the bug we are hunting. */
function recordIfUnscoped(sql: string): void {
  const flat = normalize(sql).toLowerCase();
  const touchesThreads = flat.includes("from threads") || flat.includes("update threads");
  if (touchesThreads && !flat.includes("organization_id")) {
    state.unscopedThreadQueries.push(normalize(sql));
  }
}

function statement(sql: string, args: unknown[] = []) {
  return {
    sql,
    args,
    bind(...nextArgs: unknown[]) { return statement(sql, nextArgs); },
    async first() {
      recordIfUnscoped(sql);
      const flat = normalize(sql);
      if (flat.includes("FROM threads WHERE id")) {
        // Real query: WHERE id = ? AND organization_id = ?  -> args [threadId, organizationId]
        const [threadId, organizationId] = args as [string, string];
        const row = state.threads.find(
          (t) => t.id === threadId && t.organizationId === organizationId,
        );
        return row
          ? { id: row.id, deviceId: row.deviceId, sourceSessionId: row.sourceSessionId, deletedAt: row.deletedAt }
          : null;
      }
      return null;
    },
    async all() {
      recordIfUnscoped(sql);
      const flat = normalize(sql);
      if (flat.includes("FROM threads WHERE organization_id")) {
        const [organizationId] = args as [string];
        const rows = state.threads.filter((t) => t.organizationId === organizationId && !t.deletedAt);
        return { results: rows.map((r) => ({ id: r.id, deviceId: r.deviceId, sourceSessionId: r.sourceSessionId })) };
      }
      return { results: [] };
    },
    async run() {
      recordIfUnscoped(sql);
      state.writes.push({ sql: normalize(sql), args });
      return { meta: { changes: 1 } };
    },
  };
}

vi.mock("./runtime", () => ({
  db: () => ({
    prepare(sql: string) { return statement(sql); },
    async batch(statements: Array<{ sql: string; args: unknown[] }>) {
      for (const item of statements) {
        recordIfUnscoped(item.sql);
        state.writes.push({ sql: normalize(item.sql), args: item.args });
      }
    },
  }),
}));
vi.mock("./audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./security", () => ({
  randomToken: () => "lease-token",
  sanitizeText: (value: unknown, max: number) => String(value ?? "").slice(0, max).trim(),
  timingSafeEqual: (a: string, b: string) => a === b,
}));

const { renameThread, deleteThread, clearThreads, ThreadOperationError } = await import("./thread-operations");

describe("cross-tenant isolation", () => {
  beforeEach(() => {
    state.threads = [{
      id: THREAD_IN_A,
      organizationId: ORG_A,
      deviceId: null,
      sourceSessionId: null,
      deletedAt: null,
    }];
    state.writes = [];
    state.unscopedThreadQueries = [];
  });

  it("org B cannot rename a thread owned by org A", async () => {
    await expect(renameThread({
      organizationId: ORG_B,
      userId: "user_beta",
      threadId: THREAD_IN_A,
      title: "renamed by an outsider",
    })).rejects.toThrow(ThreadOperationError);

    // And nothing was written on the failed attempt.
    expect(state.writes).toHaveLength(0);
  });

  it("reports 404 (not 403) so a foreign thread's existence is not disclosed", async () => {
    let status: number | undefined;
    try {
      await deleteThread({ organizationId: ORG_B, userId: "user_beta", threadId: THREAD_IN_A });
    } catch (error) {
      status = (error as { status?: number }).status;
    }
    expect(status).toBe(404);
  });

  it("org B cannot delete a thread owned by org A", async () => {
    await expect(deleteThread({
      organizationId: ORG_B,
      userId: "user_beta",
      threadId: THREAD_IN_A,
    })).rejects.toThrow(ThreadOperationError);
    expect(state.writes).toHaveLength(0);

    // The row is still there and still belongs to A.
    expect(state.threads.find((t) => t.id === THREAD_IN_A)?.organizationId).toBe(ORG_A);
  });

  it("clearThreads for org B does not touch org A's threads", async () => {
    const result = await clearThreads({ organizationId: ORG_B, userId: "user_beta" });
    expect(result.cleared).toBe(0);
    expect(state.writes).toHaveLength(0);
  });

  it("the owning org CAN operate on its own thread (guard is not simply denying everything)", async () => {
    const renamed = await renameThread({
      organizationId: ORG_A,
      userId: "user_alpha",
      threadId: THREAD_IN_A,
      title: "legitimate rename",
    });
    expect(renamed.title).toBe("legitimate rename");
    expect(state.writes.length).toBeGreaterThan(0);
  });

  it("every threads query carries the organization_id predicate", async () => {
    await clearThreads({ organizationId: ORG_A, userId: "user_alpha" });
    await renameThread({
      organizationId: ORG_A, userId: "user_alpha", threadId: THREAD_IN_A, title: "scoped",
    });
    try {
      await deleteThread({ organizationId: ORG_B, userId: "user_beta", threadId: THREAD_IN_A });
    } catch { /* expected */ }

    // This is the regression that a tenant-aware fake alone would NOT catch:
    // dropping `AND organization_id = ?` from a threads query.
    expect(state.unscopedThreadQueries).toEqual([]);
  });
});
