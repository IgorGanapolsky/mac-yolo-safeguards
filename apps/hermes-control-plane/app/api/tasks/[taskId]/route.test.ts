import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  first: vi.fn(),
  queries: [] as Array<{ sql: string; values: unknown[] }>,
}));

vi.mock("@/lib/auth", () => ({
  requireSession: mocks.requireSession,
}));

vi.mock("@/lib/runtime", () => ({
  db: () => ({
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          mocks.queries.push({ sql, values });
          return { first: mocks.first };
        },
      };
    },
  }),
}));

const { GET } = await import("./route");

const session = {
  sessionHash: "session-hash",
  userId: "user-1",
  organizationId: "org-1",
  workosSessionId: null,
  email: "owner@example.com",
  name: "Owner",
  avatarUrl: null,
  plan: "pro",
  trialEndsAt: null,
};

const task = {
  id: "task-1",
  threadId: "thread-1",
  threadTitle: "Stable receipt",
  prompt: "private customer prompt",
  status: "completed",
  route: "cloud",
  result: "private task result",
  error: null,
  createdAt: 100,
  updatedAt: 200,
  completedAt: 200,
  deviceName: null,
};

function get(taskId = "task-1") {
  return GET(new Request(`https://thumbgate.app/api/tasks/${taskId}`), {
    params: Promise.resolve({ taskId }),
  });
}

describe("GET /api/tasks/{taskId}", () => {
  beforeEach(() => {
    mocks.requireSession.mockReset().mockResolvedValue(session);
    mocks.first.mockReset().mockResolvedValue(task);
    mocks.queries.length = 0;
  });

  it("requires the existing ThumbGate session without querying tasks", async () => {
    mocks.requireSession.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

    const response = await get();

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "sign in required" });
    expect(mocks.queries).toEqual([]);
  });

  it("looks up the task by id and organization while excluding deleted threads", async () => {
    const response = await get("task-owned");

    expect(response.status).toBe(200);
    expect(mocks.queries).toHaveLength(1);
    expect(mocks.queries[0].values).toEqual(["task-owned", "org-1"]);
    expect(mocks.queries[0].sql).toMatch(/k\.id = \? AND k\.organization_id = \?/);
    expect(mocks.queries[0].sql).toMatch(/JOIN threads t ON t\.id = k\.thread_id AND t\.organization_id = k\.organization_id/);
    expect(mocks.queries[0].sql).toMatch(/t\.deleted_at IS NULL/);
  });

  it("makes missing, cross-organization, and deleted-thread tasks indistinguishable", async () => {
    mocks.first.mockResolvedValue(null);

    const response = await get("unavailable-task");

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "task not found" });
  });

  it("returns existing task fields with a content-free hosted receipt and no-store semantics", async () => {
    const response = await get();
    const body = await response.json() as { task: typeof task; receipt: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.task).toEqual(task);
    expect(body.receipt).toEqual({
      ok: true,
      taskId: "task-1",
      route: "cloud",
      status: "completed",
      sourceOfTruth: "hosted-vps",
    });
    expect(body.receipt).not.toHaveProperty("prompt");
    expect(body.receipt).not.toHaveProperty("result");
    expect(JSON.stringify(body.receipt)).not.toContain("private customer prompt");
    expect(JSON.stringify(body.receipt)).not.toContain("private task result");
  });
});
