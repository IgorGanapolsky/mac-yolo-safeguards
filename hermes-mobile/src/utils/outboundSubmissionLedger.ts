import type { HermesMessage } from '../types/chat';
import { normalizeMessageText } from './chatMessageMerge';

/**
 * One user message must produce exactly ONE gateway submission.
 *
 * P0 (2026-07-25 device report): a stalled run auto-recovered by calling
 * sendUserText() again. The local bubble was reused, but the gateway had
 * already accepted the first POST — so the Mac executed the prompt twice and
 * the server transcript came back with two identical user rows ("Run stalled
 * on your Mac — recovering automatically…" followed a minute later by
 * "○ Waiting for computer…").
 *
 * The ledger records every outbound submission and, separately, whether the
 * gateway ACCEPTED it. Acceptance is recorded independently of
 * `markOutboundBubbleStatus`, which is gated on macHttpOk and therefore leaves
 * a delivered bubble sitting on `pending` whenever the phone's health probe is
 * red at that instant — the exact state that produced the duplicate.
 */

/** Keep the ledger bounded — one chat thread never needs more than this. */
export const OUTBOUND_LEDGER_MAX_RECORDS = 24;

export type OutboundSubmissionRecord = {
  outboundId: string;
  /** normalizeMessageText() of the display body this submission carried. */
  body: string;
  submittedAtMs: number;
  /** Set once the gateway took the prompt — the Mac has it, never re-POST. */
  acceptedAtMs?: number;
};

export type OutboundSubmissionLedger = {
  records: OutboundSubmissionRecord[];
};

export function createOutboundSubmissionLedger(): OutboundSubmissionLedger {
  return { records: [] };
}

export function createOutboundId(nowMs: number, seq: number): string {
  return `ob-${nowMs}-${seq}`;
}

export function clearOutboundSubmissions(ledger: OutboundSubmissionLedger): void {
  ledger.records = [];
}

/**
 * Record an attempted submission. Re-recording the same outboundId is a no-op so
 * a retried stream inside one send cannot look like two user messages.
 */
export function recordOutboundSubmission(
  ledger: OutboundSubmissionLedger,
  input: { outboundId: string; body: string; nowMs: number },
): void {
  const body = normalizeMessageText(input.body);
  if (!input.outboundId.trim() || !body) {
    return;
  }
  const existing = ledger.records.find((record) => record.outboundId === input.outboundId);
  if (existing) {
    return;
  }
  ledger.records.push({
    outboundId: input.outboundId,
    body,
    submittedAtMs: input.nowMs,
  });
  if (ledger.records.length > OUTBOUND_LEDGER_MAX_RECORDS) {
    ledger.records = ledger.records.slice(-OUTBOUND_LEDGER_MAX_RECORDS);
  }
}

/** The gateway accepted this submission — the prompt is on the Mac. */
export function markOutboundSubmissionAccepted(
  ledger: OutboundSubmissionLedger,
  outboundId: string,
  nowMs: number,
): void {
  const record = ledger.records.find((entry) => entry.outboundId === outboundId);
  if (!record || record.acceptedAtMs != null) {
    return;
  }
  record.acceptedAtMs = nowMs;
}

export function findOutboundSubmissionForBody(
  ledger: OutboundSubmissionLedger,
  body: string,
): OutboundSubmissionRecord | undefined {
  const normalized = normalizeMessageText(body ?? '');
  if (!normalized) {
    return undefined;
  }
  for (let index = ledger.records.length - 1; index >= 0; index -= 1) {
    const record = ledger.records[index];
    if (record && record.body === normalized) {
      return record;
    }
  }
  return undefined;
}

export function hasAcceptedSubmissionForBody(
  ledger: OutboundSubmissionLedger,
  body: string,
): boolean {
  return findOutboundSubmissionForBody(ledger, body)?.acceptedAtMs != null;
}

export type StallRecoveryPlan =
  | { kind: 'none' }
  /** The Mac already has this prompt — poll for the reply, never submit again. */
  | { kind: 'resume'; outboundId: string }
  /** Never reached the gateway — a resend is still exactly one submission. */
  | { kind: 'resend' };

/**
 * Decide how auto stall-recovery must proceed.
 *
 * Resume is the only safe answer once the gateway accepted the prompt: the run
 * may still be alive on the Mac, so re-POSTing both duplicates the work and
 * appends a second identical user row to the server transcript.
 */
export function resolveStallRecoveryPlan(input: {
  failedText?: string | null;
  ledger: OutboundSubmissionLedger;
}): StallRecoveryPlan {
  const text = input.failedText?.trim();
  if (!text) {
    return { kind: 'none' };
  }
  const record = findOutboundSubmissionForBody(input.ledger, text);
  if (record?.acceptedAtMs != null) {
    return { kind: 'resume', outboundId: record.outboundId };
  }
  return { kind: 'resend' };
}

/**
 * Flip failed/pending bubbles for this body back to `sent` (delivered, awaiting
 * reply). Used by the resume path so the transcript stops claiming the send
 * failed while the Mac is still working on it.
 */
export function markOutboundBubbleDelivered(
  messages: HermesMessage[],
  body: string,
): HermesMessage[] {
  const normalized = normalizeMessageText(body ?? '');
  if (!normalized) {
    return messages;
  }
  let changed = false;
  const next = messages.map((message) => {
    if (message.role?.toLowerCase() !== 'user') {
      return message;
    }
    if (message.outboundStatus !== 'failed' && message.outboundStatus !== 'pending') {
      return message;
    }
    const messageBody = normalizeMessageText(
      message.rawContent?.trim() || message.content?.trim() || '',
    );
    if (messageBody !== normalized) {
      return message;
    }
    changed = true;
    return {
      ...message,
      outboundStatus: 'sent' as const,
      outboundFailureReason: undefined,
    };
  });
  return changed ? next : messages;
}
