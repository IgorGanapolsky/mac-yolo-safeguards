import {
  resolveSessionUsagePollMs,
  SESSION_USAGE_POLL_MIN_MS,
  SESSION_USAGE_POLL_MS,
} from '../utils/sessionUsagePoll';

describe('sessionUsagePoll', () => {
  it('defaults to 2s so usage polling does not thrash the chat UI', () => {
    expect(SESSION_USAGE_POLL_MS).toBe(2_000);
    expect(SESSION_USAGE_POLL_MS).toBeGreaterThanOrEqual(SESSION_USAGE_POLL_MIN_MS);
  });

  it('rejects sub-minimum intervals that reintroduce 500ms churn', () => {
    expect(resolveSessionUsagePollMs(500)).toBe(SESSION_USAGE_POLL_MS);
    expect(resolveSessionUsagePollMs(0)).toBe(SESSION_USAGE_POLL_MS);
    expect(resolveSessionUsagePollMs(Number.NaN)).toBe(SESSION_USAGE_POLL_MS);
  });

  it('allows intervals at or above the minimum', () => {
    expect(resolveSessionUsagePollMs(1_500)).toBe(1_500);
    expect(resolveSessionUsagePollMs(3_000)).toBe(3_000);
  });
});
