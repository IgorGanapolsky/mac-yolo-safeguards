import type { HermesMessage } from '../types/chat';
import { normalizeMessageText } from './chatMessageMerge';
import { isConnectivityMessage, isRawAbortMessage, USER_RUN_INTERRUPTED_MESSAGE } from './chatErrors';

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
  /** Session that owns this submission; null only before a first session exists. */
  sessionId: string | null;
  /** Optimistic user bubble that owns this submission. */
  messageId: string | null;
  /** normalizeMessageText() of the display body this submission carried. */
  body: string;
  submittedAtMs: number;
  /**
   * Set the instant the request is handed to the network.
   *
   * Distinct from acceptedAtMs on purpose: if we dispatched but never saw the
   * acknowledgement, the POST may still have landed and the Mac may be running
   * it. That state is AMBIGUOUS and must never be auto-resent — an in-memory
   * client acknowledgement cannot prove non-acceptance.
   */
  dispatchedAtMs?: number;
  /** Set once the gateway took the prompt — the Mac has it, never re-POST. */
  acceptedAtMs?: number;
};

export type OutboundAutoResendState = {
  count: number;
  lastAtMs: number;
};

export type OutboundSubmissionLedger = {
  records: OutboundSubmissionRecord[];
  /** intent key → automatic resend budget, so a flapping link cannot fan out copies. */
  autoResend: Record<string, OutboundAutoResendState>;
};

export function createOutboundSubmissionLedger(): OutboundSubmissionLedger {
  return { records: [], autoResend: {} };
}

export function createOutboundId(nowMs: number, seq: number): string {
  return `ob-${nowMs}-${seq}`;
}

/**
 * Stable identity for one user INTENT across submissions.
 *
 * The optimistic bubble id is reused by findReusableOptimisticUserBubble on every
 * retry, so it survives resends; the normalized body is the fallback for turns
 * that have not been committed to a bubble yet.
 */
export function outboundIntentKey(input: {
  messageId?: string | null;
  body: string;
}): string {
  const messageId = input.messageId?.trim();
  if (messageId) {
    return `msg:${messageId}`;
  }
  return `body:${normalizeMessageText(input.body ?? '')}`;
}

export function clearOutboundSubmissions(ledger: OutboundSubmissionLedger): void {
  ledger.records = [];
  ledger.autoResend = {};
}

/**
 * Record an attempted submission. Re-recording the same outboundId is a no-op so
 * a retried stream inside one send cannot look like two user messages.
 */
export function recordOutboundSubmission(
  ledger: OutboundSubmissionLedger,
  input: {
    outboundId: string;
    sessionId?: string | null;
    messageId?: string | null;
    body: string;
    nowMs: number;
  },
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
    sessionId: input.sessionId?.trim() || null,
    messageId: input.messageId?.trim() || null,
    body,
    submittedAtMs: input.nowMs,
  });
  if (ledger.records.length > OUTBOUND_LEDGER_MAX_RECORDS) {
    ledger.records = ledger.records.slice(-OUTBOUND_LEDGER_MAX_RECORDS);
  }
}

/**
 * Keep only records belonging to the selected session.
 *
 * This replaces blanket clearing on every currentSession id change. A first
 * message creates its session asynchronously; React may run the id-change
 * effect after that message has already been accepted. Filtering by ownership
 * preserves that record while still preventing cross-thread body matches.
 */
export function scopeOutboundSubmissionsToSession(
  ledger: OutboundSubmissionLedger,
  sessionId: string | null | undefined,
): void {
  const target = sessionId?.trim() || null;
  if (!target) {
    ledger.records = [];
    ledger.autoResend = {};
    return;
  }
  // Records with a null sessionId are IN FLIGHT: the first turn of a new chat
  // records its submission before the session exists, and setCurrentSession runs
  // before attachOutboundSubmissionSession. Dropping them here would lose the
  // acceptance mark for that turn and let stall recovery repost it.
  ledger.records = ledger.records.filter(
    (record) => record.sessionId === target || record.sessionId === null,
  );
  const surviving = new Set(
    ledger.records.map((record) =>
      outboundIntentKey({ messageId: record.messageId, body: record.body }),
    ),
  );
  ledger.autoResend = Object.fromEntries(
    Object.entries(ledger.autoResend ?? {}).filter(([key]) => surviving.has(key)),
  );
}

/**
 * Attach the real target session once sendUserText has resolved/created it.
 *
 * The submission is recorded before the offline gate so an undelivered prompt is
 * provably undelivered; at that point the session may still be null.
 */
export function attachOutboundSubmissionSession(
  ledger: OutboundSubmissionLedger,
  outboundId: string,
  sessionId: string | null | undefined,
): void {
  const target = sessionId?.trim() || null;
  if (!target) {
    return;
  }
  const record = ledger.records.find((entry) => entry.outboundId === outboundId);
  if (!record || record.sessionId === target) {
    return;
  }
  record.sessionId = target;
}

/** Handed to the network — from here on, non-delivery can no longer be proven. */
export function markOutboundSubmissionDispatched(
  ledger: OutboundSubmissionLedger,
  outboundId: string,
  nowMs: number,
): void {
  const record = ledger.records.find((entry) => entry.outboundId === outboundId);
  if (!record || record.dispatchedAtMs != null) {
    return;
  }
  record.dispatchedAtMs = nowMs;
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
  // Delivered for real — a later, genuinely new failure deserves a full budget.
  clearAutoResendAttempts(
    ledger,
    outboundIntentKey({ messageId: record.messageId, body: record.body }),
  );
}

export function findOutboundSubmissionForBody(
  ledger: OutboundSubmissionLedger,
  body: string,
  sessionId?: string | null,
  messageId?: string | null,
): OutboundSubmissionRecord | undefined {
  const normalized = normalizeMessageText(body ?? '');
  if (!normalized) {
    return undefined;
  }
  for (let index = ledger.records.length - 1; index >= 0; index -= 1) {
    const record = ledger.records[index];
    const targetSessionId = sessionId?.trim() || null;
    const targetMessageId = messageId?.trim() || null;
    if (
      record &&
      record.body === normalized &&
      (sessionId === undefined || record.sessionId === targetSessionId) &&
      (messageId === undefined || record.messageId === targetMessageId)
    ) {
      return record;
    }
  }
  return undefined;
}

export function hasAcceptedSubmissionForBody(
  ledger: OutboundSubmissionLedger,
  body: string,
  sessionId?: string | null,
  messageId?: string | null,
): boolean {
  return findOutboundSubmissionForBody(ledger, body, sessionId, messageId)?.acceptedAtMs != null;
}

/**
 * Automatic resend budget for a single intent.
 *
 * Igor's mini flaps: a watchdog SIGTERMs its gateway roughly every 60s during a
 * slow start, so reconnect edges arrive in bursts. The cooldown absorbs the
 * burst (one submission per window) and the cap bounds the whole episode.
 */
export const RECONNECT_AUTO_RESEND_MAX_ATTEMPTS = 3;
export const RECONNECT_AUTO_RESEND_COOLDOWN_MS = 20_000;
/** Settle time before acting on a reconnect — a 1s green blip is not a reconnect. */
export const RECONNECT_AUTO_RESEND_DEBOUNCE_MS = 1_200;

export function autoResendAttemptCount(
  ledger: OutboundSubmissionLedger,
  intentKey: string,
): number {
  return ledger.autoResend?.[intentKey]?.count ?? 0;
}

export function recordAutoResendAttempt(
  ledger: OutboundSubmissionLedger,
  intentKey: string,
  nowMs: number,
): void {
  if (!intentKey.trim()) {
    return;
  }
  if (!ledger.autoResend) {
    ledger.autoResend = {};
  }
  const existing = ledger.autoResend[intentKey];
  ledger.autoResend[intentKey] = {
    count: (existing?.count ?? 0) + 1,
    lastAtMs: nowMs,
  };
}

export function clearAutoResendAttempts(
  ledger: OutboundSubmissionLedger,
  intentKey: string,
): void {
  if (!ledger.autoResend) {
    return;
  }
  delete ledger.autoResend[intentKey];
}

/**
 * Only a TRANSPORT failure may be resent without asking.
 *
 * Everything else is either something a resend cannot fix (permanent API
 * rejection, wrong key, mega-context block) or something the user explicitly
 * chose (Stop). Auto-resending a stopped run silently undoes the Stop, which is
 * strictly worse than doing nothing.
 */
export function isAutoResendableFailureReason(reason: string | null | undefined): boolean {
  const text = reason?.trim();
  if (!text) {
    // No recorded reason: the send never got far enough to produce one.
    return true;
  }
  if (isRawAbortMessage(text) || text === USER_RUN_INTERRUPTED_MESSAGE) {
    return false;
  }
  const lower = text.toLowerCase();
  if (
    lower.includes('stopped') ||
    lower.includes('interrupted') ||
    lower.includes('outdated connection') ||
    lower.includes('wrong key') ||
    lower.includes('session_in_use') ||
    lower.includes('already in use') ||
    lower.includes('still on the previous chat') ||
    lower.includes('chat too large') ||
    lower.includes('too large')
  ) {
    return false;
  }
  return isConnectivityMessage(text);
}

export type ReconnectResendPlan =
  | {
      kind: 'none';
      reason:
        | 'nothing_to_send'
        | 'demo'
        | 'offline'
        | 'busy'
        | 'cooldown'
        | 'attempts_exhausted'
        /** Not a transport failure — resending cannot fix it and may undo Stop. */
        | 'not_connectivity'
        /** Dispatched but unacknowledged: the Mac may already hold it. */
        | 'ambiguous_dispatch';
    }
  /** Gateway ACCEPTED it — the Mac has the prompt. Poll, never resubmit. */
  | { kind: 'resume'; outboundId: string; intentKey: string }
  /** Provably never reached the Mac — resending duplicates nothing. */
  | { kind: 'resend'; intentKey: string; attempt: number };

/**
 * Reconnection policy for a failed outbound.
 *
 * The distinction that makes automatic resend SAFE is accepted-vs-not-accepted,
 * not manual-vs-automatic:
 *
 *  - accepted  → the Mac is (or was) running it. Resubmitting duplicates the
 *    user's instruction and appends a second user row. Resume instead.
 *  - not accepted → nothing exists on the Mac to duplicate, so resending on
 *    reconnect is unambiguously correct and needs no tap.
 *
 * A missing ledger record is treated as not-accepted: sendUserText records the
 * submission before the offline gate, so every outbound intent this app created
 * has a record. Anything without one never went through a send at all.
 */
export function resolveReconnectResendPlan(input: {
  failedText?: string | null;
  sessionId?: string | null;
  messageId?: string | null;
  /** Why the turn failed — only transport failures may be auto-resent. */
  failureReason?: string | null;
  /**
   * The failed bubble carries a gateway-assigned id (it survived a transcript
   * merge), i.e. the server stored this turn. Strongest available proof of
   * acceptance, independent of any client-side acknowledgement.
   */
  serverAcknowledged?: boolean;
  ledger: OutboundSubmissionLedger;
  nowMs: number;
  macChatLive: boolean;
  isDemo: boolean;
  isSending: boolean;
  maxAttempts?: number;
  cooldownMs?: number;
}): ReconnectResendPlan {
  const text = input.failedText?.trim();
  if (!text) {
    return { kind: 'none', reason: 'nothing_to_send' };
  }
  if (input.isDemo) {
    return { kind: 'none', reason: 'demo' };
  }
  if (!input.macChatLive) {
    return { kind: 'none', reason: 'offline' };
  }
  if (input.isSending) {
    return { kind: 'none', reason: 'busy' };
  }

  const record = findOutboundSubmissionForBody(
    input.ledger,
    text,
    input.sessionId,
    input.messageId,
  );
  const intentKey = outboundIntentKey({ messageId: input.messageId, body: text });
  if (record?.acceptedAtMs != null) {
    return { kind: 'resume', outboundId: record.outboundId, intentKey };
  }
  if (input.serverAcknowledged) {
    // The gateway stored this turn even though we never saw the ack.
    return { kind: 'resume', outboundId: record?.outboundId ?? '', intentKey };
  }
  if (!isAutoResendableFailureReason(input.failureReason)) {
    // User Stop, wrong key, session busy, or a permanent API rejection.
    // Resending cannot help and would silently undo an explicit Stop.
    return { kind: 'none', reason: 'not_connectivity' };
  }
  if (record?.dispatchedAtMs != null) {
    // In flight when the link died: the POST may have landed. Duplicating a live
    // run is strictly worse than waiting, so leave this to resume/manual retry.
    return { kind: 'none', reason: 'ambiguous_dispatch' };
  }

  const maxAttempts = input.maxAttempts ?? RECONNECT_AUTO_RESEND_MAX_ATTEMPTS;
  const cooldownMs = input.cooldownMs ?? RECONNECT_AUTO_RESEND_COOLDOWN_MS;
  const state = input.ledger.autoResend?.[intentKey];
  if ((state?.count ?? 0) >= maxAttempts) {
    return { kind: 'none', reason: 'attempts_exhausted' };
  }
  if (state && input.nowMs - state.lastAtMs < cooldownMs) {
    // Reconnect burst from a flapping gateway — one submission per window.
    return { kind: 'none', reason: 'cooldown' };
  }
  return { kind: 'resend', intentKey, attempt: (state?.count ?? 0) + 1 };
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
  sessionId?: string | null;
  messageId?: string | null;
  ledger: OutboundSubmissionLedger;
}): StallRecoveryPlan {
  const text = input.failedText?.trim();
  if (!text) {
    return { kind: 'none' };
  }
  const record = findOutboundSubmissionForBody(
    input.ledger,
    text,
    input.sessionId,
    input.messageId,
  );
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
