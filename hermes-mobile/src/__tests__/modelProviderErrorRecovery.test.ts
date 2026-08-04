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
