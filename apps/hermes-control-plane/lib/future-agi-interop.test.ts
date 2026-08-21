import { describe, expect, it } from "vitest";
import { buildFutureAgiInteropMetadata } from "./future-agi-interop";
import type { ExecutionReceipt, ReceiptOutcome } from "./execution-receipt";

function receipt(outcome: ReceiptOutcome, overrides: Partial<ExecutionReceipt> = {}): ExecutionReceipt {
  return {
    actor: "runner:private-runner-id",
    verb: "task.complete.cloud",
    target: "task:private-task-id",
    timestamp: 1_787_316_000_123,
    outcome,
    externalCheck: null,
    note: "private note",
    ...overrides,
  };
}

function attributesOf(input: ExecutionReceipt): Record<string, string | number | boolean> {
  const metadata = buildFutureAgiInteropMetadata(input);
  return Object.fromEntries(metadata.span.attributes.map(({ key, value }) => [
    key,
    "stringValue" in value
      ? value.stringValue
      : "doubleValue" in value
        ? value.doubleValue
        : value.boolValue,
  ]));
}

describe("Future AGI compatible receipt telemetry", () => {
  it("emits OTLP/JSON IDs, nanosecond timestamps, and GenAI semantic attributes", () => {
    const metadata = buildFutureAgiInteropMetadata(receipt("done", {
      externalCheck: { kind: "provider_receipt", passed: true, evidenceId: "private-provider-id" },
    }));
    const attributes = attributesOf(receipt("done", {
      externalCheck: { kind: "provider_receipt", passed: true, evidenceId: "private-provider-id" },
    }));

    expect(metadata.schema).toBe("thumbgate/future-agi-compatible-otlp-v1");
    expect(metadata.compatibility).toBe("otlp-http-json/gen-ai");
    expect(metadata.affiliation).toBe(false);
    expect(metadata.span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(metadata.span.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(metadata.span.startTimeUnixNano).toBe("1787316000123000000");
    expect(metadata.span.endTimeUnixNano).toBe(metadata.span.startTimeUnixNano);
    expect(metadata.span.kind).toBe(1);
    expect(metadata.span.status.code).toBe(1);
    expect(attributes).toMatchObject({
      "gen_ai.operation.name": "task.complete.cloud",
      "gen_ai.span.kind": "AGENT",
      "gen_ai.evaluation.name": "thumbgate.external_outcome",
      "gen_ai.evaluation.score.value": 1,
      "gen_ai.evaluation.score.label": "verified",
      "gen_ai.guardrail.result": "verified",
      "thumbgate.external_check.present": true,
      "thumbgate.external_check.passed": true,
      "thumbgate.external_check.kind": "provider_receipt",
    });
    expect(metadata.remediationProposal).toBeNull();
  });

  it("never exports identity, content, evidence IDs, or uncontrolled verifier text", () => {
    const input = {
      ...receipt("failed", {
        externalCheck: {
          kind: "Customer alice@example.com prompt was bad",
          passed: false,
          evidenceId: "stripe_evt_private",
        },
      }),
      prompt: "private prompt",
      output: "private result",
      toolArguments: { secret: "private-secret" },
    } as ExecutionReceipt;

    const serialized = JSON.stringify(buildFutureAgiInteropMetadata(input));
    expect(serialized).not.toContain("private-runner-id");
    expect(serialized).not.toContain("private-task-id");
    expect(serialized).not.toContain("private note");
    expect(serialized).not.toContain("alice@example.com");
    expect(serialized).not.toContain("stripe_evt_private");
    expect(serialized).not.toContain("private prompt");
    expect(serialized).not.toContain("private result");
    expect(serialized).not.toContain("private-secret");
    expect(attributesOf(input)["thumbgate.external_check.kind"]).toBe("other");
  });

  it.each([
    ["failed", "failed", 2, "review_external_failure"],
    ["claimed_done", "unverified", 0, "require_external_verifier"],
    ["claimed_failed", "unverified_failure", 2, "review_executor_failure"],
    ["open", "pending", 0, "await_external_verifier"],
    ["denied", "denied", 2, "review_denial_policy"],
  ] as const)("maps %s to deterministic evaluation and approval-required remediation", (
    outcome,
    label,
    statusCode,
    recommendedAction,
  ) => {
    const metadata = buildFutureAgiInteropMetadata(receipt(outcome));
    expect(attributesOf(receipt(outcome))["gen_ai.evaluation.score.label"]).toBe(label);
    expect(metadata.span.status.code).toBe(statusCode);
    expect(metadata.remediationProposal).toEqual({
      status: "needs_approval",
      reasonCode: outcome,
      recommendedAction,
    });
    expect(JSON.stringify(metadata.remediationProposal)).not.toContain("active");
  });
});
