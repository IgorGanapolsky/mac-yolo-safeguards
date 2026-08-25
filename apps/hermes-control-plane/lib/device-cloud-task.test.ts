import { describe, expect, it } from "vitest";
import { decideTaskRoute } from "@/lib/task-routing";

describe("device cloud task routing", () => {
  it("forces cloud_pending for mobile continuity submit preference", () => {
    const decision = decideTaskRoute({
      preference: "cloud",
      device: { failoverMode: "auto", lastSeenAt: Date.now() },
    });
    expect(decision).toEqual({
      status: "cloud_pending",
      route: "cloud",
      preference: "cloud",
    });
  });
});
