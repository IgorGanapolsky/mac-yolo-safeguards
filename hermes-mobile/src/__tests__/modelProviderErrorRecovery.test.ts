import {
  MODEL_PROVIDER_ERROR_HUMAN_MESSAGE,
  MODEL_TURN_LIMIT_HUMAN_MESSAGE,
  humanizeModelProviderErrorMessage,
  isModelProviderErrorMessage,
  isTurnTimeLimitMessage,
  shouldSuggestFreshAfterModelProviderError,
} from '../utils/modelProviderErrorRecovery';

/** Exact shape from device screenshot 2026-07-30 (mega chat + mini). */
const SCREENSHOT_DUMP =
  "I reached the turn time limit and couldn't generate a final report Error: Error code: 500 - " +
  "{'error': {'message': 'an error was encountered while running the model: unexpected EOF', " +
  "'type': 'api_error', 'param': None, 'code': None}}";

describe('modelProviderErrorRecovery', () => {
  it('detects the screenshot unexpected-EOF + turn-time-limit dump', () => {
    expect(isModelProviderErrorMessage(SCREENSHOT_DUMP)).toBe(true);
    expect(isTurnTimeLimitMessage(SCREENSHOT_DUMP)).toBe(true);
    expect(shouldSuggestFreshAfterModelProviderError(SCREENSHOT_DUMP)).toBe(true);
  });

  it('humanizes the screenshot dump to start-fresh copy (no raw Error code)', () => {
    const out = humanizeModelProviderErrorMessage(SCREENSHOT_DUMP);
    expect(out).toBe(MODEL_TURN_LIMIT_HUMAN_MESSAGE);
    expect(out.toLowerCase()).not.toContain('unexpected eof');
    expect(out.toLowerCase()).not.toContain('error code');
    expect(out.toLowerCase()).not.toContain('api_error');
  });

  it('humanizes bare unexpected EOF provider crashes', () => {
    const raw =
      "Error: Error code: 500 - {'error': {'message': 'an error was encountered while running the model: unexpected EOF', 'type': 'api_error'}}";
    expect(isModelProviderErrorMessage(raw)).toBe(true);
    expect(humanizeModelProviderErrorMessage(raw)).toBe(MODEL_PROVIDER_ERROR_HUMAN_MESSAGE);
  });

  it('does not rewrite ordinary product answers that mention time', () => {
    const prose =
      'Earlier today I hit a time limit while researching Skool communities, so here is the shortlist of leads.';
    expect(isModelProviderErrorMessage(prose)).toBe(false);
    expect(humanizeModelProviderErrorMessage(prose)).toBe(prose);
  });

  it('does not rewrite empty or huge blobs', () => {
    expect(isModelProviderErrorMessage('')).toBe(false);
    expect(isModelProviderErrorMessage(null)).toBe(false);
    const huge = `Error code: 500 unexpected EOF ${'x'.repeat(3_000)}`;
    expect(isModelProviderErrorMessage(huge)).toBe(false);
  });
});

// Incident follow-up 2026-07-30. The copy shipped with this detector asserts a
// CAUSE the app cannot observe: "large threads often crash the model", plus
// "Start a fresh chat" as the remedy.
//
// That attribution was wrong for the very incident it was written for. Ollama's
// server.log shows the model was never loaded:
//   "client connection closed before llama-server finished loading, aborting load"
//   error="timed out waiting for llama-server to start: context canceled"
// A 6.6 GB cold load at n_ctx=65536 outlasted the ~5 min client timeout, so the
// client disconnected and aborted the load it was waiting on. Thread size did not
// cause it — an unconfigured primary route on the Mac did. Zero jetsam events.
//
// The detector also fires on 'connection reset by peer', 'incomplete chunked read'
// and 'model stream closed'. Discarding the conversation fixes none of those.
// Detect confidently; do not narrate a cause we cannot see, and never imply the
// user's own chat is at fault for a server-side config fault.
describe('error copy does not blame the user for a cause it cannot observe', () => {
  it('never asserts thread size as the cause of a provider crash', () => {
    expect(MODEL_PROVIDER_ERROR_HUMAN_MESSAGE).not.toMatch(/large threads/i);
    expect(MODEL_PROVIDER_ERROR_HUMAN_MESSAGE).not.toMatch(/often crash/i);
  });

  it('offers an action that actually helps a transient model failure', () => {
    // Retrying re-drives the load that was aborted. Starting a fresh chat does not.
    expect(MODEL_PROVIDER_ERROR_HUMAN_MESSAGE).toMatch(/try again/i);
  });

  it('states thread size as a possibility, never as fact, on the turn-limit path', () => {
    // A long turn genuinely CAN be context-driven, so the suggestion is allowed —
    // but hedged, because today's real cause was a cold-load timeout.
    expect(MODEL_TURN_LIMIT_HUMAN_MESSAGE).not.toMatch(/is (too|likely too) large/i);
  });

  it('still humanizes the verbatim incident payload', () => {
    // The detection was correct and must not regress while fixing the wording.
    const out = humanizeModelProviderErrorMessage(SCREENSHOT_DUMP);
    expect(out.toLowerCase()).not.toContain('api_error');
    expect(out.toLowerCase()).not.toContain('unexpected eof');
  });
});
