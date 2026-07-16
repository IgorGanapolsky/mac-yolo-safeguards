/**
 * Chat stall investigation (Agent Conf / eBay theme: faster alert TTM).
 *
 * When the phone sits on "Delivering…" for minutes, do not leave the user
 * with vibes — classify the most likely root cause and the one next action.
 * Pure helpers only (no network).
 */

import { isWeakLocalCodingModel } from './weakLocalModel';
import { MEGA_SESSION_TOKEN_WARN, MEGA_SESSION_TOKEN_BLOCK } from './sessionTokenGuards';

/** After this, surface a diagnosis strip (eBay-style: open investigation early). */
export const STALL_INVESTIGATE_AFTER_MS = 45_000;

/** After this with no output tokens, bias toward no-first-token / model choke. */
export const STALL_NO_TOKEN_ESCALATE_MS = 90_000;

export type StallRootCause =
  | 'mac_unreachable'
  | 'mega_session'
  | 'weak_local_model'
  | 'no_first_token'
  | 'stream_idle'
  | 'session_busy'
  | 'unknown';

export type StallAction = 'start_fresh' | 'switch_mac' | 'stop' | 'retry' | 'wait';

export type ChatStallInvestigation = {
  active: boolean;
  cause: StallRootCause;
  /** One-line diagnosis for the progress banner. */
  title: string;
  action: StallAction;
  actionLabel: string;
  /** Short "what we're optimizing" for logs / tests (TTM framing). */
  ttmHint: string;
};

export type ChatStallInvestigationInput = {
  elapsedMs: number;
  phase?: string | null;
  detail?: string | null;
  model?: string | null;
  /** Session input+output+cache total when known. */
  sessionTokens?: number | null;
  /** Live stream output tokens (0 = still waiting for first token). */
  outputTokens?: number | null;
  macHttpOk?: boolean;
};

function normalize(detail: string | null | undefined): string {
  return (detail ?? '').trim().toLowerCase();
}

export function shouldInvestigateChatStall(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= STALL_INVESTIGATE_AFTER_MS;
}

/**
 * Ranked investigation: connectivity → mega → weak model → no tokens → busy → idle → unknown.
 */
export function investigateChatStall(input: ChatStallInvestigationInput): ChatStallInvestigation {
  const elapsedMs = Math.max(0, input.elapsedMs || 0);
  const phase = (input.phase ?? '').toLowerCase();
  const detail = normalize(input.detail);
  const tokens = input.sessionTokens ?? 0;
  const out = input.outputTokens ?? 0;
  const macOk = input.macHttpOk !== false;

  if (phase === 'completed' || phase === 'failed') {
    return {
      active: false,
      cause: 'unknown',
      title: '',
      action: 'wait',
      actionLabel: '',
      ttmHint: 'terminal',
    };
  }

  if (!shouldInvestigateChatStall(elapsedMs)) {
    return {
      active: false,
      cause: 'unknown',
      title: '',
      action: 'wait',
      actionLabel: '',
      ttmHint: 'within_sla',
    };
  }

  if (!macOk || /can't reach|cannot reach|unreachable|wrong key|auth/i.test(detail)) {
    return {
      active: true,
      cause: 'mac_unreachable',
      title: 'Investigation: Mac not answering over chat path',
      action: 'retry',
      actionLabel: 'Retry connection',
      ttmHint: 'connectivity',
    };
  }

  if (tokens >= MEGA_SESSION_TOKEN_BLOCK || tokens >= MEGA_SESSION_TOKEN_WARN) {
    return {
      active: true,
      cause: 'mega_session',
      title:
        tokens >= MEGA_SESSION_TOKEN_BLOCK
          ? 'Investigation: chat is too large — model is thrashing context'
          : 'Investigation: large chat is slowing every turn',
      action: 'start_fresh',
      actionLabel: 'Start fresh chat',
      ttmHint: 'mega_context',
    };
  }

  if (isWeakLocalCodingModel(input.model)) {
    return {
      active: true,
      cause: 'weak_local_model',
      title: 'Investigation: weak local model is choking on product work',
      action: 'switch_mac',
      actionLabel: 'Switch Mac / model',
      ttmHint: 'weak_slm',
    };
  }

  if (
    /session.?in.?use|mac busy|still on the previous/i.test(detail) ||
    /busy with another/i.test(detail)
  ) {
    return {
      active: true,
      cause: 'session_busy',
      title: 'Investigation: Mac is busy on another chat',
      action: 'retry',
      actionLabel: 'Try again',
      ttmHint: 'session_busy',
    };
  }

  if (out <= 0 && elapsedMs >= STALL_NO_TOKEN_ESCALATE_MS) {
    return {
      active: true,
      cause: 'no_first_token',
      title: 'Investigation: no reply tokens yet — run likely stuck',
      action: 'start_fresh',
      actionLabel: 'Start fresh chat',
      ttmHint: 'no_first_token',
    };
  }

  if (/stall|no live progress|no reply|recovering/i.test(detail) || elapsedMs >= 3 * 60_000) {
    return {
      active: true,
      cause: 'stream_idle',
      title: 'Investigation: stream idle — stop and continue in a fresh chat',
      action: 'start_fresh',
      actionLabel: 'Start fresh chat',
      ttmHint: 'stream_idle',
    };
  }

  return {
    active: true,
    cause: 'unknown',
    title: 'Investigation: turn is slow — prefer Start fresh over waiting',
    action: 'start_fresh',
    actionLabel: 'Start fresh chat',
    ttmHint: 'slow_unknown',
  };
}
