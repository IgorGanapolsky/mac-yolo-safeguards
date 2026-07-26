import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

function statement(sql: string) {
  return {
    bind() { return this; },
    async first() {
      if (sql.includes("FROM memberships")) return { userId: "user-1" };
      return null;
    },
    async run() { return { meta: { changes: 1 } }; },
  };
}

vi.mock("@/lib/runtime", () => ({
  db: () => ({
    prepare(sql: string) { return statement(sql); },
    async batch(items: unknown[]) { return items.map(() => ({ meta: { changes: 1 } })); },
  }),
}));

vi.mock("@/lib/device-auth", () => ({
  requireDevice: vi.fn().mockResolvedValue({
    id: "device-1",
    organizationId: "org-1",
    name: "Igor's Mac",
    failoverMode: "auto",
  }),
}));

vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

const { POST } = await import("./route");

function request(sessions: Array<Record<string, unknown>>) {
  const body = JSON.stringify({ sessions });
  return new Request("https://thumbgate.app/api/device/sessions/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/device/sessions/sync", () => {
  beforeEach(() => {
    mocks.audit.mockClear();
  });

  it("rejects cron-automation session ids so they never become a user-visible thread", async () => {
    const response = await POST(request([
      { id: "cron_0eb498680d96_20260725_230637", title: "reddit-inbox-conversion-monitor" },
      { id: "cron_f4d1cc61eba9_20260726_091534", title: "another cron run" },
    ]));
    const body = await response.json() as { ok: boolean; accepted: number };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.accepted).toBe(0);
  });

  it("still accepts a real Hermes gateway session id", async () => {
    const response = await POST(request([
      { id: "sess_a1b2c3d4e5f6", title: "Real chat about launch plan" },
    ]));
    const body = await response.json() as { ok: boolean; accepted: number };
    expect(response.status).toBe(200);
    expect(body.accepted).toBe(1);
  });

  it("still accepts a thumbgate_-prefixed web-created session id", async () => {
    const response = await POST(request([
      { id: "thumbgate_thread-123", title: "Web chat" },
    ]));
    const body = await response.json() as { ok: boolean; accepted: number };
    expect(body.accepted).toBe(1);
  });

  it("filters cron ids out of a mixed batch while accepting the rest", async () => {
    const response = await POST(request([
      { id: "cron_0eb498680d96_20260725_230637", title: "cron run" },
      { id: "sess_real_session_1", title: "Real chat 1" },
      { id: "cron_f4d1cc61eba9_20260726_003811", title: "another cron run" },
      { id: "sess_real_session_2", title: "Real chat 2" },
    ]));
    const body = await response.json() as { ok: boolean; accepted: number };
    expect(body.accepted).toBe(2);
  });

  it("does not false-positive on session ids that merely contain the substring 'cron'", async () => {
    const response = await POST(request([
      { id: "sess_macron_project_notes", title: "Chat about a project called macron" },
    ]));
    const body = await response.json() as { ok: boolean; accepted: number };
    expect(body.accepted).toBe(1);
  });
});
