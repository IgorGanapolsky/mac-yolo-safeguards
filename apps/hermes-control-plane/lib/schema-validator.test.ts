import { describe, expect, it } from "vitest";

import { RouteSchemas, validateRoute } from "./schema-validator";

type DeviceSubmitPayload = {
  prompt: string;
  routePreference: "local" | "cloud" | "auto";
  contextMessages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
};

function validate(input: unknown) {
  return validateRoute<DeviceSubmitPayload>(RouteSchemas.deviceSubmitTask, input);
}

describe("RouteSchemas.deviceSubmitTask", () => {
  it("accepts the current mobile payload and defaults the route to cloud", () => {
    const result = validate({
      prompt: "  inspect the listing  ",
      threadId: "thread-1",
      contextMessages: [
        { role: "user", content: "  prior question  " },
        { role: "assistant", content: "prior answer" },
      ],
      idempotencyKey: "idem-1",
      traceId: "trace-1",
      source: "hermes-mobile-continuity",
    });

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      prompt: "inspect the listing",
      routePreference: "cloud",
      contextMessages: [
        { role: "user", content: "prior question" },
        { role: "assistant", content: "prior answer" },
      ],
    });
  });

  it.each([
    ["missing prompt", {}],
    ["blank prompt", { prompt: "   " }],
    ["non-object body", []],
    ["invalid route", { prompt: "hello", routePreference: "remote" }],
    ["too many messages", {
      prompt: "hello",
      contextMessages: Array.from({ length: 61 }, () => ({ role: "user", content: "x" })),
    }],
    ["invalid role", { prompt: "hello", contextMessages: [{ role: "tool", content: "x" }] }],
    ["unknown top-level field", { prompt: "hello", admin: true }],
    ["unknown message field", {
      prompt: "hello",
      contextMessages: [{ role: "user", content: "x", name: "spoofed" }],
    }],
  ])("rejects %s", (_label, input) => {
    expect(validate(input).ok).toBe(false);
  });

  it("rejects over-limit prompt and context content instead of silently truncating", () => {
    expect(validate({ prompt: "x".repeat(24_001) }).ok).toBe(false);
    expect(validate({
      prompt: "hello",
      contextMessages: [{ role: "user", content: "x".repeat(8_001) }],
    }).ok).toBe(false);
  });
});
