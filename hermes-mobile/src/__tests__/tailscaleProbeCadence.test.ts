import {
  shouldRunBackgroundTailscaleProbe,
  TAILSCALE_BACKGROUND_PROBE_MIN_INTERVAL_MS,
} from '../utils/tailscaleProbeCadence';

describe('shouldRunBackgroundTailscaleProbe', () => {
  it('allows the first background probe', () => {
    expect(
      shouldRunBackgroundTailscaleProbe({ lastAtMs: 0, nowMs: 1_000 }),
    ).toBe(true);
  });

  it('blocks probes inside the min interval', () => {
    expect(
      shouldRunBackgroundTailscaleProbe({
        lastAtMs: 10_000,
        nowMs: 10_000 + TAILSCALE_BACKGROUND_PROBE_MIN_INTERVAL_MS - 1,
      }),
    ).toBe(false);
  });

  it('allows probes after the min interval', () => {
    expect(
      shouldRunBackgroundTailscaleProbe({
        lastAtMs: 10_000,
        nowMs: 10_000 + TAILSCALE_BACKGROUND_PROBE_MIN_INTERVAL_MS,
      }),
    ).toBe(true);
  });
});
