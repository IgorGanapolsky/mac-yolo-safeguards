import {
  connectingToMacCopy,
  formatSavedMacUnreachableBanner,
  reconnectingToMacCopy,
  savedMacUnreachableStatus,
  savedMacUnreachableTitle,
  shouldShowActiveReconnectingCopy,
  shouldSuppressEmptyGreetingUnreachable,
} from '../utils/macUnreachableCopy';

describe('macUnreachableCopy', () => {
  it('names the saved Mac when unreachable', () => {
    expect(savedMacUnreachableTitle('Igors-Mac-mini')).toBe(
      "Igors-Mac-mini isn't reachable right now",
    );
    expect(savedMacUnreachableStatus('Igors-Mac-mini')).toBe('Igors-Mac-mini unreachable');
  });

  it('stops reconnecting copy after heal budget is spent', () => {
    expect(
      shouldShowActiveReconnectingCopy({
        macRetryBusy: false,
        healInFlight: true,
        healExhausted: true,
      }),
    ).toBe(false);
    expect(
      shouldShowActiveReconnectingCopy({
        macRetryBusy: false,
        healInFlight: true,
        healExhausted: false,
      }),
    ).toBe(true);
  });

  it('never says Reconnecting for brand-new installs (no prior connection)', () => {
    expect(
      shouldShowActiveReconnectingCopy({
        macRetryBusy: false,
        healInFlight: true,
        healExhausted: false,
        hasPriorSuccessfulConnection: false,
      }),
    ).toBe(false);
    expect(
      shouldShowActiveReconnectingCopy({
        macRetryBusy: true,
        healInFlight: false,
        healExhausted: false,
        hasPriorSuccessfulConnection: false,
      }),
    ).toBe(false);
    expect(connectingToMacCopy('Computer via USB')).toBe('Looking for your Mac…');
    expect(connectingToMacCopy()).toBe('Looking for your Mac…');
  });

  it('suppresses empty greeting unreachable during bootstrap and silent heal', () => {
    expect(
      shouldSuppressEmptyGreetingUnreachable({
        healthProbePending: true,
        healInFlight: false,
        healExhausted: false,
        hasSavedComputer: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressEmptyGreetingUnreachable({
        healthProbePending: false,
        healInFlight: true,
        healExhausted: false,
        hasSavedComputer: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressEmptyGreetingUnreachable({
        healthProbePending: false,
        healInFlight: false,
        healExhausted: true,
        hasSavedComputer: true,
      }),
    ).toBe(false);
    expect(
      shouldSuppressEmptyGreetingUnreachable({
        healthProbePending: false,
        healInFlight: true,
        healExhausted: false,
        hasSavedComputer: true,
        authMismatch: true,
      }),
    ).toBe(false);
    expect(
      shouldSuppressEmptyGreetingUnreachable({
        healthProbePending: true,
        healInFlight: true,
        healExhausted: false,
        hasSavedComputer: true,
        macReachable: true,
      }),
    ).toBe(false);
  });

  it('formats reconnecting and exhausted banners', () => {
    expect(reconnectingToMacCopy('Igors-Mac-mini')).toBe('Reconnecting to Igors-Mac-mini…');
    expect(
      formatSavedMacUnreachableBanner({
        macLabel: 'Igors-Mac-mini',
        machineEndpoint: 'USB',
      }),
    ).toBe("Can't reach Igors-Mac-mini (USB) — switch computer above");
  });
});
