import { describe, expect, it } from "vitest";
import { buildTaskCompletionReceipt, receiptAuditMetadata } from "./execution-receipt";

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

  it("attaches content-free GenAI evaluation metadata to the persisted audit receipt", () => {
    const r = buildTaskCompletionReceipt({
      actorType: "device",
      actorId: "private-device-id",
      taskId: "private-task-id",
      route: "local",
      externalCheckPassed: true,
      externalCheckKind: "provider_receipt",
      externalEvidenceId: "private-provider-id",
      now: 5_000,
    });
    const metadata = receiptAuditMetadata(r) as {
      futureAgiInterop: {
        contentPolicy: string;
        span: { attributes: Array<{ key: string }> };
      };
    };
    const serialized = JSON.stringify(metadata.futureAgiInterop);

    expect(metadata.futureAgiInterop.contentPolicy).toBe("content-free");
    expect(metadata.futureAgiInterop.span.attributes.map((item) => item.key)).toContain("gen_ai.evaluation.score.label");
    expect(serialized).not.toContain("private-device-id");
    expect(serialized).not.toContain("private-task-id");
    expect(serialized).not.toContain("private-provider-id");
  });
});
