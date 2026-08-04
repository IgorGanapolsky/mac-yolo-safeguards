/**
 * Detect model/provider crash dumps that must never reach the user as raw
 * "Error code: 500 … unexpected EOF" bubbles (incident 2026-07-30: 3M-token
 * mega chat on mini, turn time limit + unexpected EOF, then 6m+ stuck thinking).
 */

export const MODEL_PROVIDER_ERROR_HUMAN_MESSAGE =
  'The model on your computer hit a limit mid-reply. Start a fresh chat and try again — large threads often crash the model.';

export const MODEL_TURN_LIMIT_HUMAN_MESSAGE =
  'This turn ran out of time before a final reply. Start a fresh chat (this thread is likely too large) and try a shorter ask.';

/** Markers that mean the Mac model/API died mid-generation — not a normal assistant answer. */
const PROVIDER_CRASH_MARKERS = [
  'unexpected eof',
  'error code: 500',
  'error code:500',
  "type': 'api_error'",
  'type": "api_error"',
  'type: api_error',
  'an error was encountered while running the model',
  'while running the model',
  'connection reset by peer',
  'incomplete chunked read',
  'model stream closed',
  'provider error',
  'openai.error',
  'apiconnectionerror',
] as const;

const TURN_LIMIT_MARKERS = [
  'turn time limit',
  'reached the turn time limit',
  'turn timed out',
  'max turn time',
  'maximum turn duration',
  "couldn't generate a final report",
  'could not generate a final report',
] as const;

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * True when assistant/error text is a model/provider crash dump (or agent
 * apologizing for one), not a real product answer.
 */
export function isModelProviderErrorMessage(text: string | undefined | null): boolean {
  if (!text?.trim()) {
    return false;
  }
  // Long product answers that mention "error" in passing stay intact.
  const body = normalize(text);
  if (body.length > 2_500) {
    return false;
  }
  const hasCrash = PROVIDER_CRASH_MARKERS.some((m) => body.includes(m));
  const hasTurnLimit = TURN_LIMIT_MARKERS.some((m) => body.includes(m));
  if (!hasCrash && !hasTurnLimit) {
    return false;
  }
  // Require dump-shaped payload OR explicit turn-limit phrasing so we don't
  // rewrite "I hit a time limit earlier today while researching…".
  if (hasCrash) {
    return true;
  }
  return (
    body.includes('error:') ||
    body.includes('error code') ||
    body.includes("couldn't generate") ||
    body.includes('could not generate') ||
    body.includes('reached the turn time limit')
  );
}

export function isTurnTimeLimitMessage(text: string | undefined | null): boolean {
  if (!text?.trim()) {
    return false;
  }
  const body = normalize(text);
  return TURN_LIMIT_MARKERS.some((m) => body.includes(m));
}

/** Map crash/turn-limit dumps to actionable phone copy. */
export function humanizeModelProviderErrorMessage(text: string): string {
  if (!isModelProviderErrorMessage(text)) {
    return text;
  }
  if (isTurnTimeLimitMessage(text) && !PROVIDER_CRASH_MARKERS.some((m) => normalize(text).includes(m))) {
    return MODEL_TURN_LIMIT_HUMAN_MESSAGE;
  }
  // Combined "turn time limit … Error code: 500 unexpected EOF" → start-fresh path.
  if (isTurnTimeLimitMessage(text)) {
    return MODEL_TURN_LIMIT_HUMAN_MESSAGE;
  }
  return MODEL_PROVIDER_ERROR_HUMAN_MESSAGE;
}

/** Prefer Start fresh after this class of failure (mega/poisoned context). */
export function shouldSuggestFreshAfterModelProviderError(
  text: string | undefined | null,
): boolean {
  return isModelProviderErrorMessage(text);
}
