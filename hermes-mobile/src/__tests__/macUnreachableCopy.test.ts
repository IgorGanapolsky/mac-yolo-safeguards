import {
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

  it('never shows Reconnecting copy for never-connected users', () => {
    expect(
      shouldShowActiveReconnectingCopy({
        macRetryBusy: true,
        healInFlight: true,
        healExhausted: false,
        hasSavedComputer: false,
      }),
    ).toBe(false);
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
