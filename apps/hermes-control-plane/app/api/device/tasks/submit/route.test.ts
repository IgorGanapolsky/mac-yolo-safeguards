import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submitDeviceCloudTask: vi.fn(),
}));

vi.mock("@/lib/device-auth", () => ({
  requireDevice: vi.fn().mockResolvedValue({
    id: "device-1",
    organizationId: "org-1",
    name: "Hermes Mobile",
    failoverMode: "auto",
  }),
}));

vi.mock("@/lib/device-cloud-task", () => ({
  submitDeviceCloudTask: mocks.submitDeviceCloudTask,
}));

const { POST } = await import("./route");

function request(body: string | Record<string, unknown>) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://thumbgate.app/api/device/tasks/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: text,
  });
}

describe("POST /api/device/tasks/submit schema boundary", () => {
  beforeEach(() => {
    mocks.submitDeviceCloudTask.mockReset();
  });

  it.each([
    ["invalid JSON", "{"],
    ["missing prompt", {}],
    ["invalid route", { prompt: "hello", routePreference: "remote" }],
    ["oversized context array", {
      prompt: "hello",
      contextMessages: Array.from({ length: 61 }, () => ({ role: "user", content: "x" })),
    }],
    ["invalid context role", {
      prompt: "hello",
      contextMessages: [{ role: "tool", content: "x" }],
    }],
    ["unknown top-level field", { prompt: "hello", privileged: true }],
    ["unknown context field", {
      prompt: "hello",
      contextMessages: [{ role: "user", content: "x", name: "spoofed" }],
    }],
  ])("returns 400 for %s before task admission", async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(mocks.submitDeviceCloudTask).not.toHaveBeenCalled();
  });

  it("accepts the current mobile payload and passes normalized values to admission", async () => {
    mocks.submitDeviceCloudTask.mockResolvedValue({
      task: { id: "task-1", threadId: "thread-1", status: "cloud_pending", route: "cloud", prompt: "hello" },
      receipt: { taskId: "task-1" },
      traceId: "trace-1",
    });

    const response = await POST(request({
      prompt: "  hello  ",
      contextMessages: [{ role: "user", content: "  prior question  " }],
      source: "hermes-mobile-continuity",
    }));

    expect(response.status).toBe(201);
    expect(mocks.submitDeviceCloudTask).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "hello",
      routePreference: "cloud",
      contextMessages: [{ role: "user", content: "prior question" }],
      source: "hermes-mobile-continuity",
    }));
  });
});
