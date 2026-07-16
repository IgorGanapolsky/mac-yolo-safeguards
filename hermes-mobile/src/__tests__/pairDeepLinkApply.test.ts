import {
  evaluatePairDeepLinkApply,
  FOREGROUND_USB_HEAL_ATTEMPTS,
  FOREGROUND_USB_HEAL_DURATION_MS,
  shouldRunForegroundUsbHeal,
} from '../utils/pairDeepLinkApply';
import { CONNECTION_HEAL_DURATION_MS } from '../utils/connectionErrorPolicy';

describe('pairDeepLinkApply', () => {
  it('keeps 30s foreground USB heal budget aligned with connection heal policy', () => {
    expect(FOREGROUND_USB_HEAL_DURATION_MS).toBe(CONNECTION_HEAL_DURATION_MS);
    expect(FOREGROUND_USB_HEAL_DURATION_MS).toBe(30_000);
    expect(FOREGROUND_USB_HEAL_ATTEMPTS).toBe(6);
  });

  it('does not persist profiles or settings when secretless exchange failed', () => {
    const decision = evaluatePairDeepLinkApply({
      params: {
        pairingCode: 'AB23CD45',
        pairServerUrl: 'http://192.168.1.5:8765',
      },
      relayPairAttempted: false,
      relayPairSucceeded: false,
    });
    expect(decision.shouldPersistProfiles).toBe(false);
    expect(decision.shouldPersistSettings).toBe(false);
    expect(decision.connectionMode).toBe('gateway');
    expect(decision.userError).toMatch(/saved computers were kept/i);
  });

  it('does not persist when relay-only pair failed', () => {
    const decision = evaluatePairDeepLinkApply({
      params: { relayCode: 'MOON-DUST' },
      relayPairAttempted: true,
      relayPairSucceeded: false,
    });
    expect(decision.shouldPersistProfiles).toBe(false);
    expect(decision.shouldPersistSettings).toBe(false);
  });

  it('persists gateway profile in gateway mode when relay fails but gateway URL is valid', () => {
    const decision = evaluatePairDeepLinkApply({
      params: {
        relayCode: 'MOON-DUST',
        gatewayUrl: 'http://127.0.0.1:8642',
        apiKey: 'sk-test',
      },
      relayPairAttempted: true,
      relayPairSucceeded: false,
    });
    expect(decision.shouldPersistProfiles).toBe(true);
    expect(decision.shouldPersistSettings).toBe(true);
    expect(decision.connectionMode).toBe('gateway');
  });

  it('uses relay mode only after relay pair succeeds', () => {
    const decision = evaluatePairDeepLinkApply({
      params: {
        relayCode: 'MOON-DUST',
        gatewayUrl: 'http://127.0.0.1:8642',
        apiKey: 'sk-test',
      },
      relayPairAttempted: true,
      relayPairSucceeded: true,
    });
    expect(decision.connectionMode).toBe('relay');
  });

  it('uses gateway mode for gateway-only deep links', () => {
    const decision = evaluatePairDeepLinkApply({
      params: {
        gatewayUrl: 'http://100.94.135.78:8642',
        apiKey: 'sk-test',
      },
      relayPairAttempted: false,
      relayPairSucceeded: false,
    });
    expect(decision.connectionMode).toBe('gateway');
    expect(decision.shouldPersistProfiles).toBe(true);
  });
});

describe('shouldRunForegroundUsbHeal', () => {
  it('runs on native when health is not ok', () => {
    expect(
      shouldRunForegroundUsbHeal({ platform: 'android', demoMode: false, healthOk: false }),
    ).toBe(true);
  });

  it('skips when already healthy or in demo/web', () => {
    expect(
      shouldRunForegroundUsbHeal({ platform: 'android', demoMode: false, healthOk: true }),
    ).toBe(false);
    expect(
      shouldRunForegroundUsbHeal({ platform: 'android', demoMode: true, healthOk: false }),
    ).toBe(false);
    expect(
      shouldRunForegroundUsbHeal({ platform: 'web', demoMode: false, healthOk: false }),
    ).toBe(false);
  });
});
