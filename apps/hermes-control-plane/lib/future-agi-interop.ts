import type { ExecutionReceipt, ReceiptOutcome } from "./execution-receipt";
import { generateSpanId, generateTraceId } from "./tracing";

type OtlpValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { doubleValue: number };

export interface OtlpAttribute {
  key: string;
  value: OtlpValue;
}

export interface FutureAgiCompatibleSpan {
  traceId: string;
  spanId: string;
  name: string;
  kind: 1;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: { code: 0 | 1 | 2 };
}

export interface RemediationProposal {
  status: "needs_approval";
  reasonCode: Exclude<ReceiptOutcome, "done">;
  recommendedAction:
    | "require_external_verifier"
    | "review_external_failure"
    | "review_executor_failure"
    | "await_external_verifier"
    | "review_denial_policy";
}

export interface FutureAgiInteropMetadata {
  schema: "thumbgate/future-agi-compatible-otlp-v1";
  compatibility: "otlp-http-json/gen-ai";
  contentPolicy: "content-free";
  affiliation: false;
  span: FutureAgiCompatibleSpan;
  remediationProposal: RemediationProposal | null;
}

type Evaluation = {
  label: "verified" | "failed" | "unverified" | "unverified_failure" | "pending" | "denied";
  score: 0 | 1;
  statusCode: 0 | 1 | 2;
};

const KNOWN_EXTERNAL_CHECK_KINDS = new Set([
  "filesystem",
  "human_approval",
  "provider_receipt",
  "row_exists",
  "webhook",
]);

function attribute(key: string, value: string | boolean | number): OtlpAttribute {
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  if (typeof value === "number") return { key, value: { doubleValue: value } };
  return { key, value: { stringValue: value } };
}

function evaluationFor(outcome: ReceiptOutcome): Evaluation {
  switch (outcome) {
    case "done":
      return { label: "verified", score: 1, statusCode: 1 };
    case "failed":
      return { label: "failed", score: 0, statusCode: 2 };
    case "claimed_done":
      return { label: "unverified", score: 0, statusCode: 0 };
    case "claimed_failed":
      return { label: "unverified_failure", score: 0, statusCode: 2 };
    case "open":
      return { label: "pending", score: 0, statusCode: 0 };
    case "denied":
      return { label: "denied", score: 0, statusCode: 2 };
  }
}

function remediationFor(outcome: ReceiptOutcome): RemediationProposal | null {
  switch (outcome) {
    case "done":
      return null;
    case "failed":
      return { status: "needs_approval", reasonCode: outcome, recommendedAction: "review_external_failure" };
    case "claimed_done":
      return { status: "needs_approval", reasonCode: outcome, recommendedAction: "require_external_verifier" };
    case "claimed_failed":
      return { status: "needs_approval", reasonCode: outcome, recommendedAction: "review_executor_failure" };
    case "open":
      return { status: "needs_approval", reasonCode: outcome, recommendedAction: "await_external_verifier" };
    case "denied":
      return { status: "needs_approval", reasonCode: outcome, recommendedAction: "review_denial_policy" };
  }
}

function normalizedExternalCheckKind(receipt: ExecutionReceipt): string | null {
  const kind = receipt.externalCheck?.kind?.trim().toLowerCase();
  if (!kind) return null;
  return KNOWN_EXTERNAL_CHECK_KINDS.has(kind) ? kind : "other";
}

/**
 * Convert an execution receipt into a Future-AGI-compatible OTLP/JSON span.
 *
 * The converter is intentionally content-free. It never exports receipt actor,
 * target, note, or evidence IDs. Verifier names are allowlisted because callers
 * control that string and may accidentally put customer data in it.
 */
export function buildFutureAgiInteropMetadata(receipt: ExecutionReceipt): FutureAgiInteropMetadata {
  const evaluation = evaluationFor(receipt.outcome);
  const timestampUnixNano = (BigInt(receipt.timestamp) * 1_000_000n).toString();
  const checkKind = normalizedExternalCheckKind(receipt);
  const attributes = [
    attribute("gen_ai.operation.name", receipt.verb),
    attribute("gen_ai.span.kind", "AGENT"),
    attribute("gen_ai.evaluation.name", "thumbgate.external_outcome"),
    attribute("gen_ai.evaluation.score.value", evaluation.score),
    attribute("gen_ai.evaluation.score.label", evaluation.label),
    attribute("gen_ai.guardrail.name", "thumbgate.execution_receipt"),
    attribute("gen_ai.guardrail.type", "external_verification"),
    attribute("gen_ai.guardrail.result", evaluation.label),
    attribute("thumbgate.receipt.outcome", receipt.outcome),
    attribute("thumbgate.external_check.present", Boolean(receipt.externalCheck)),
  ];

  if (typeof receipt.externalCheck?.passed === "boolean") {
    attributes.push(attribute("thumbgate.external_check.passed", receipt.externalCheck.passed));
  }
  if (checkKind) {
    attributes.push(attribute("thumbgate.external_check.kind", checkKind));
  }

  return {
    schema: "thumbgate/future-agi-compatible-otlp-v1",
    compatibility: "otlp-http-json/gen-ai",
    contentPolicy: "content-free",
    affiliation: false,
    span: {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      name: receipt.verb,
      kind: 1,
      startTimeUnixNano: timestampUnixNano,
      endTimeUnixNano: timestampUnixNano,
      attributes,
      status: { code: evaluation.statusCode },
    },
    remediationProposal: remediationFor(receipt.outcome),
  };
}
