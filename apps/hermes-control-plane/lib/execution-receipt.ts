/**
 * Five-field execution receipts (inspired by reliability practice + SeqPU-style
 * closed logs, 2026-07-23 Reddit peer exchange).
 *
 * actor / verb / target / timestamp / outcome
 *
 * Critical rule: outcome is only "done" when an *external* check the executor
 * cannot self-sign passes. Self-reported model text is "claimed_*" never "done".
 */

export type ReceiptOutcome =
  | "done" // external check passed
  | "failed" // external check failed or hard error
  | "claimed_done" // executor self-reported success without external proof
  | "claimed_failed"
  | "open" // still waiting for check
  | "denied";

export type ExecutionReceipt = {
  actor: string;
  verb: string;
  target: string;
  timestamp: number;
  outcome: ReceiptOutcome;
  externalCheck?: {
    kind: string;
    passed: boolean | null;
    evidenceId?: string | null;
  } | null;
  /** Short, non-proprietary note — never chat bodies. */
  note?: string;
};

export function buildTaskCompletionReceipt(input: {
  actorType: "device" | "runner";
  actorId: string;
  taskId: string;
  route: "local" | "cloud";
  error?: string | null;
  /** If true, a side-effect receipt independent of the model text was verified. */
  externalCheckPassed?: boolean | null;
  externalCheckKind?: string | null;
  externalEvidenceId?: string | null;
  now?: number;
}): ExecutionReceipt {
  const timestamp = input.now ?? Date.now();
  const hasExternal =
    input.externalCheckPassed === true || input.externalCheckPassed === false;

  let outcome: ReceiptOutcome;
  if (hasExternal) {
    outcome = input.externalCheckPassed ? "done" : "failed";
  } else if (input.error) {
    outcome = "claimed_failed";
  } else {
    // Model/runner returned text without an external verifier → not "done".
    outcome = "claimed_done";
  }

  return {
    actor: `${input.actorType}:${input.actorId}`,
    verb: input.route === "cloud" ? "task.complete.cloud" : "task.complete.local",
    target: `task:${input.taskId}`,
    timestamp,
    outcome,
    externalCheck: hasExternal
      ? {
          kind: input.externalCheckKind ?? "unspecified",
          passed: input.externalCheckPassed ?? null,
          evidenceId: input.externalEvidenceId ?? null,
        }
      : null,
    note: input.error
      ? "executor_error"
      : hasExternal
        ? "external_check"
        : "self_reported_only",
  };
}

export function receiptAuditMetadata(receipt: ExecutionReceipt): Record<string, unknown> {
  return {
    receipt: {
      actor: receipt.actor,
      verb: receipt.verb,
      target: receipt.target,
      timestamp: receipt.timestamp,
      outcome: receipt.outcome,
      externalCheck: receipt.externalCheck,
      note: receipt.note,
    },
  };
}
