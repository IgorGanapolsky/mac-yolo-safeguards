import { describe, expect, it } from "vitest";

import { webSessionIdForThread } from "./web-session";

describe("webSessionIdForThread", () => {
  it("returns a deterministic Hermes-safe binding for a web thread", () => {
    expect(webSessionIdForThread("70a0ce2e-f5d2-4f84-89bc-2ab6d1d0a451"))
      .toBe("thumbgate_70a0ce2e-f5d2-4f84-89bc-2ab6d1d0a451");
  });

  it("strips unsafe session-id characters and rejects an empty id", () => {
    expect(webSessionIdForThread("thread/../../1\n")).toBe("thumbgate_thread1");
    expect(() => webSessionIdForThread("../../\n")).toThrow(/valid thread ID/);
  });
});
