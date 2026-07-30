/**
 * Detect model/provider crash dumps that must never reach the user as raw
 * "Error code: 500 … unexpected EOF" bubbles (incident 2026-07-30: 3M-token
 * mega chat on mini, turn time limit + unexpected EOF, then 6m+ stuck thinking).
 */

// Describe what happened; never narrate a cause the app cannot see.
//
// The original wording ("large threads often crash the model" / "this thread is
// likely too large") was written from a theory that the 2026-07-30 incident later
// disproved. Ollama's server.log for that exact failure shows the model was never
// loaded at all:
//   "client connection closed before llama-server finished loading, aborting load"
//   error="timed out waiting for llama-server to start: context canceled"
// A 6.6 GB cold load at n_ctx=65536 outlasted the ~5 min client timeout, so the
// client hung up and aborted the load it was waiting on. There were ZERO jetsam
// events. The user's thread size did not cause it — an unconfigured primary route
// on the Mac did, and discarding the conversation would not have helped.
//
// This detector also fires on 'connection reset by peer', 'incomplete chunked
// read' and 'model stream closed', none of which a fresh chat fixes either. So the
// copy states the observable fact and offers the action that genuinely re-drives
// the failed request.
export const MODEL_PROVIDER_ERROR_HUMAN_MESSAGE =
  'The AI model on your computer stopped responding mid-reply. Tap ↑ to try again.';

// A turn CAN run long because of a big thread, so the hint stays — but as a
// possibility, not the verdict it used to be stated as.
export const MODEL_TURN_LIMIT_HUMAN_MESSAGE =
  'This turn ran out of time before a final reply. Tap ↑ to try again, or start a '
  + 'fresh chat if this one has grown long.';

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
