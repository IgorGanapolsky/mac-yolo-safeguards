import { describe, expect, it } from "vitest";
import { buildTaskCompletionReceipt } from "./execution-receipt";

describe("buildTaskCompletionReceipt", () => {
  it("never marks self-reported success as done", () => {
    const r = buildTaskCompletionReceipt({
      actorType: "runner",
      actorId: "fly-1",
      taskId: "t1",
      route: "cloud",
      now: 1000,
    });
    expect(r.outcome).toBe("claimed_done");
    expect(r.externalCheck).toBeNull();
    expect(r.note).toBe("self_reported_only");
    expect(r.togetherNative?.liveClaim).toBe(false);
    expect(r.togetherNative?.capacityIsNotFrontier).toBe(true);
  });

  it("marks external-verified success as done", () => {
    const r = buildTaskCompletionReceipt({
      actorType: "device",
      actorId: "mac-1",
      taskId: "t2",
      route: "local",
      externalCheckPassed: true,
      externalCheckKind: "provider_receipt",
      externalEvidenceId: "stripe_evt_1",
      now: 2000,
    });
    expect(r.outcome).toBe("done");
    expect(r.externalCheck?.passed).toBe(true);
  });

  it("marks external-failed check as failed even without executor error string", () => {
    const r = buildTaskCompletionReceipt({
      actorType: "runner",
      actorId: "fly-1",
      taskId: "t3",
      route: "cloud",
      externalCheckPassed: false,
      externalCheckKind: "row_exists",
      now: 3000,
    });
    expect(r.outcome).toBe("failed");
  });

  it("uses claimed_failed for self-reported errors without external check", () => {
    const r = buildTaskCompletionReceipt({
      actorType: "runner",
      actorId: "fly-1",
      taskId: "t4",
      route: "cloud",
      error: "timeout",
      now: 4000,
    });
    expect(r.outcome).toBe("claimed_failed");
  });

  it("does not treat claimed_done as academy quality", () => {
    const r = buildTaskCompletionReceipt({
      actorType: "runner",
      actorId: "fly-1",
      taskId: "t5",
      route: "cloud",
      now: 5000,
    });
    expect(r.outcome).toBe("claimed_done");
    expect(r.academy4d?.liveClaim).toBe(false);
    expect(r.academy4d?.completedIsNotQuality).toBe(true);
    expect(r.academy4d?.diligenceCall).toBe("fix");
  });

  it("keeps outcome=done from becoming academy ship without five lenses", () => {
    const r = buildTaskCompletionReceipt({
      actorType: "device",
      actorId: "mac-1",
      taskId: "t6",
      route: "local",
      externalCheckPassed: true,
      externalCheckKind: "provider_receipt",
      now: 6000,
    });
    expect(r.outcome).toBe("done");
    expect(r.academy4d?.liveClaim).toBe(false);
    expect(r.academy4d?.diligenceCall).toBe("fix");
  });
});
