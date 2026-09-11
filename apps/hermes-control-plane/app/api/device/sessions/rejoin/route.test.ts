import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRejoinPacksForDevice: vi.fn(),
  ackRejoinPacks: vi.fn(),
}));

vi.mock("@/lib/device-auth", () => ({
  requireDevice: vi.fn().mockResolvedValue({
    id: "device-1",
    organizationId: "org-1",
    name: "Igor's Mac",
    failoverMode: "auto",
  }),
}));

vi.mock("@/lib/session-rejoin", () => ({
  listRejoinPacksForDevice: mocks.listRejoinPacksForDevice,
  ackRejoinPacks: mocks.ackRejoinPacks,
}));

const { POST } = await import("./route");

describe("POST /api/device/sessions/rejoin", () => {
  beforeEach(() => {
    mocks.listRejoinPacksForDevice.mockReset();
    mocks.ackRejoinPacks.mockReset();
  });

  it("lists rejoin packs for an empty body", async () => {
    mocks.listRejoinPacksForDevice.mockResolvedValue([
      {
        threadId: "thread-1",
        threadTitle: "Chat",
        sourceSessionId: "thumbgate_1",
        watermark: 99,
        taskIds: ["t1"],
        handoffMessages: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }],
        cloudRejoinedAt: null,
      },
    ]);
    const response = await POST(new Request("https://thumbgate.app/api/device/sessions/rejoin", {
      method: "POST",
      body: "{}",
    }));
    const body = await response.json() as { ok: boolean; packs: unknown[] };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.packs).toHaveLength(1);
    expect(mocks.listRejoinPacksForDevice).toHaveBeenCalledWith({
      deviceId: "device-1",
      organizationId: "org-1",
    });
  });

  it("acks watermarks when acks are provided", async () => {
    mocks.ackRejoinPacks.mockResolvedValue({ accepted: 1 });
    const response = await POST(new Request("https://thumbgate.app/api/device/sessions/rejoin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acks: [{ threadId: "thread-1", watermark: 99 }] }),
    }));
    const body = await response.json() as { ok: boolean; accepted: number };
    expect(body.ok).toBe(true);
    expect(body.accepted).toBe(1);
    expect(mocks.ackRejoinPacks).toHaveBeenCalledWith({
      deviceId: "device-1",
      organizationId: "org-1",
      actorId: "device-1",
      acks: [{ threadId: "thread-1", watermark: 99 }],
    });
  });
});
