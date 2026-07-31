/**
 * Honest outcomes for Hermes Mobile → ThumbGate feedback capture.
 *
 * Never treat offline-queue or skipped capture as "Saved to ThumbGate" without
 * saying so — that false confidence blocked real improvement loops.
 */

export type ThumbgateFeedbackStatus =
  | 'accepted'
  | 'queued_offline'
  | 'blocked'
  | 'failed';

export type ThumbgateFeedbackCode =
  | 'ok'
  | 'missing_api_key'
  | 'capture_disabled'
  | 'leash_locked'
  | 'network'
  | 'unauthorized'
  | 'server'
  | 'unknown';

export type ThumbgateFeedbackOutcome = {
  status: ThumbgateFeedbackStatus;
  /** True only when the ThumbGate server accepted the capture. */
  accepted: boolean;
  code: ThumbgateFeedbackCode;
  feedbackId?: string;
  queuedOffline?: boolean;
  /** Short operator-facing note (UI). */
  note: string;
  /** True when the note is an error / needs attention. */
  noteIsError: boolean;
};

export function outcomeAccepted(feedbackId?: string): ThumbgateFeedbackOutcome {
  return {
    status: 'accepted',
    accepted: true,
    code: 'ok',
    feedbackId,
    note: 'Saved to ThumbGate memory',
    noteIsError: false,
  };
}

export function outcomeQueuedOffline(): ThumbgateFeedbackOutcome {
  return {
    status: 'queued_offline',
    accepted: false,
    code: 'network',
    queuedOffline: true,
    note: 'Queued offline — will sync when ThumbGate is reachable',
    noteIsError: false,
  };
}

export function outcomeBlocked(
  code: Extract<
    ThumbgateFeedbackCode,
    'missing_api_key' | 'capture_disabled' | 'leash_locked'
  >,
): ThumbgateFeedbackOutcome {
  if (code === 'missing_api_key') {
    return {
      status: 'blocked',
      accepted: false,
      code,
      note: 'Not saved — add ThumbGate API key in Settings',
      noteIsError: true,
    };
  }
  if (code === 'capture_disabled') {
    return {
      status: 'blocked',
      accepted: false,
      code,
      note: 'Not saved — turn on Leash capture toggles',
      noteIsError: true,
    };
  }
  return {
    status: 'blocked',
    accepted: false,
    code,
    note: 'Not saved — Leash capture unavailable',
    noteIsError: true,
  };
}

export function outcomeFailed(
  code: Extract<ThumbgateFeedbackCode, 'network' | 'unauthorized' | 'server' | 'unknown'> = 'unknown',
  detail?: string,
): ThumbgateFeedbackOutcome {
  if (code === 'unauthorized') {
    return {
      status: 'failed',
      accepted: false,
      code,
      note: 'Not saved — ThumbGate API key rejected',
      noteIsError: true,
    };
  }
  if (code === 'network') {
    return {
      status: 'failed',
      accepted: false,
      code,
      note: detail?.trim()
        ? `Not saved — ${detail.trim().slice(0, 80)}`
        : 'Not saved — network error',
      noteIsError: true,
    };
  }
  return {
    status: 'failed',
    accepted: false,
    code,
    note: detail?.trim()
      ? `Not saved — ${detail.trim().slice(0, 80)}`
      : 'Not saved — ThumbGate capture failed',
    noteIsError: true,
  };
}

/** Map raw capture client result into operator-facing outcome. */
export function outcomeFromCaptureResult(result: {
  accepted?: boolean;
  feedbackId?: string;
  queuedOffline?: boolean;
  status?: number | string;
  errorMessage?: string;
}): ThumbgateFeedbackOutcome {
  if (result.queuedOffline) {
    return outcomeQueuedOffline();
  }
  if (result.accepted) {
    return outcomeAccepted(
      typeof result.feedbackId === 'string' ? result.feedbackId : undefined,
    );
  }
  if (result.status === 401 || result.status === 403) {
    return outcomeFailed('unauthorized');
  }
  if (result.errorMessage) {
    return outcomeFailed('server', result.errorMessage);
  }
  return outcomeFailed('unknown');
}
