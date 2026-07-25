/**
 * Steal from Anthropic Opus 5 positioning (TNS 2026-07-24): long-running agents
 * "check their own work and recover from errors" instead of hard-stopping.
 *
 * Phone-side: when the Mac returns a stall/error/safety-timeout style assistant
 * turn while HTTP is healthy, auto-nudge once with a self-check continue payload.
 * Does not invent new models or burn paid cloud routes.
 */

import {
  isSafetyTimeoutAssistantMessage,
  SAFETY_TIMEOUT_AUTO_CONTINUE_TEXT,
  SAFETY_TIMEOUT_HUMAN_MESSAGE,
  shouldAutoContinueAfterSafetyTimeout,
} from './safetyTimeoutRecovery';

export {
  isSafetyTimeoutAssistantMessage,
  SAFETY_TIMEOUT_AUTO_CONTINUE_TEXT,
  SAFETY_TIMEOUT_HUMAN_MESSAGE,
  shouldAutoContinueAfterSafetyTimeout,
};

/** User-visible status while the phone auto-nudges the Mac agent to self-check. */
export const AGENT_SELF_CHECK_RECOVERING_HINT = 'Agent recovering — checking its work…';

/**
 * Recovery payload (Opus 5-style self-check). Prefer the short gateway-native
 * "continue" for safety-timeouts; use the longer self-check for generic stalls.
 */
export const AGENT_SELF_CHECK_CONTINUE_TEXT =
  'Continue. Check your work, recover from any errors, and finish the task.';

/** Max automatic self-check continues per session per foreground. */
export const AGENT_SELF_CHECK_AUTO_CONTINUE_MAX = 2;

/** Delay before auto-nudge so a late SSE chunk can land first. */
export const AGENT_SELF_CHECK_AUTO_CONTINUE_MS = 2_000;

const AGENT_ERROR_STALL_MARKERS = [
  'i ran into an error',
  'ran into an error',
  'tool failed',
  'tool call failed',
  'could not complete',
  "couldn't complete",
  'unable to complete',
  'failed to execute',
  'execution failed',
  'something went wrong',
  'encountered an error',
  'interrupted further progress',
  'please try again',
  'try again later',
  'i got stuck',
  'got stuck',
  'need to recover',
  'let me try a different approach',
] as const;

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Assistant turn looks like an agent stall/error that self-check can recover. */
export function isAgentErrorStallAssistantMessage(text: string | undefined | null): boolean {
  if (!text?.trim()) {
    return false;
  }
  if (isSafetyTimeoutAssistantMessage(text)) {
    return true;
  }
  const body = normalize(text);
  if (body.length > 1600) {
    return false;
  }
  // Real completed answers are usually longer and do not lead with failure copy.
  return AGENT_ERROR_STALL_MARKERS.some((marker) => body.includes(marker));
}

export function resolveAgentSelfCheckContinueText(assistantText: string | undefined | null): string {
  if (isSafetyTimeoutAssistantMessage(assistantText)) {
    return SAFETY_TIMEOUT_AUTO_CONTINUE_TEXT;
  }
  return AGENT_SELF_CHECK_CONTINUE_TEXT;
}

/**
 * When true, the phone should auto-send a self-check continue message.
 * Caps retries; requires healthy Mac HTTP; skips demo/sending.
 */
export function shouldAutoContinueAfterAgentStall(input: {
  assistantText: string | undefined | null;
  macHttpOk: boolean;
  isDemo: boolean;
  isSending: boolean;
  recoveriesUsed: number;
  maxRecoveries?: number;
}): boolean {
  if (input.isDemo || !input.macHttpOk || input.isSending) {
    return false;
  }
  const max = input.maxRecoveries ?? AGENT_SELF_CHECK_AUTO_CONTINUE_MAX;
  if (input.recoveriesUsed >= max) {
    return false;
  }
  if (shouldAutoContinueAfterSafetyTimeout(input)) {
    return true;
  }
  return isAgentErrorStallAssistantMessage(input.assistantText);
}
