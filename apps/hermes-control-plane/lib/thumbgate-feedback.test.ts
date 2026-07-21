import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state: { apiKey: string | undefined } = { apiKey: undefined };

vi.mock("./runtime", () => ({
  runtimeEnv: () => ({ THUMBGATE_API_KEY: state.apiKey }),
}));

import { buildThumbgateCaptureBody, sendThumbgateFeedback } from "./thumbgate-feedback";

describe("thumbgate feedback", () => {
  beforeEach(() => { state.apiKey = undefined; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("builds a down-signal capture body with clipped context", () => {
    const body = buildThumbgateCaptureBody({ signal: "down", threadTitle: "Ship revenue loop", messageContent: "x".repeat(2000) });
    expect(body.signal).toBe("down");
    expect(body.context).toContain("thread: Ship revenue loop");
    expect(body.context.length).toBeLessThan(2000);
    expect(body.whatWentWrong).toBeTruthy();
    expect(body.tags).toContain("thumbs-down");
  });

  it("builds an up-signal capture body", () => {
    const body = buildThumbgateCaptureBody({ signal: "up", threadTitle: "Ship revenue loop", messageContent: "looks good" });
    expect(body.whatWorked).toBeTruthy();
    expect(body.tags).toContain("thumbs-up");
  });

  it("skips the remote call entirely when no API key is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await sendThumbgateFeedback({ signal: "up", context: "test" });
    expect(result).toEqual({ status: "skipped" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards to the hosted ThumbGate API with a bearer key when configured", async () => {
    state.apiKey = "tg_live_test_key";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feedbackId: "fb_123" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await sendThumbgateFeedback({ signal: "down", context: "test" });
    expect(result).toEqual({ status: "sent", remoteFeedbackId: "fb_123" });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://thumbgate-production.up.railway.app/v1/feedback/capture");
    expect(init.headers.Authorization).toBe("Bearer tg_live_test_key");
  });

  it("reports failed status without throwing when the remote call errors", async () => {
    state.apiKey = "tg_live_test_key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await sendThumbgateFeedback({ signal: "up", context: "test" });
    expect(result).toEqual({ status: "failed" });
  });

  it("reports failed status on a non-ok response", async () => {
    state.apiKey = "tg_live_test_key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const result = await sendThumbgateFeedback({ signal: "up", context: "test" });
    expect(result).toEqual({ status: "failed" });
  });
});
