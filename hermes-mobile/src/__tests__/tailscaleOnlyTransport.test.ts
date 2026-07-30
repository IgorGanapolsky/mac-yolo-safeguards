import {
  dedupePickerProfilesById,
  profilePickerLines,
  profileConnectionRouteDisplayLabel,
  isUsbTransportAllowed,
} from '../utils/gatewayProfilePicker';
import {
  resolveHeaderTransportLabel,
  isUsbHeaderTransportAllowed,
  formatMacConnectionRetryBanner,
  DIRECT_LINK_TRANSPORT_LABEL,
} from '../utils/chatMachineHeader';
import type { GatewayProfile } from '../types/gatewayProfile';

// CEO directive 2026-07-26 / 2026-07-30: "I never want to see USB" — product only knows
// Tailscale + Home Wi‑Fi. Loopback/cable is dogfood-only (EXPO_PUBLIC_ALLOW_USB_TRANSPORT=1).
const profile = (id: string, gatewayUrl: string): GatewayProfile => ({
  id,
  gatewayUrl,
  label: 'Igors-MacBook-Pro',
  addedAt: '2026-07-26T00:00:00.000Z',
});

const USB = profile('usb', 'http://127.0.0.1:8642');
const TS = profile('ts', 'http://100.87.85.85:8642');
const LAN = profile('lan', 'http://192.168.68.73:8642');

describe('tailscale-only transport', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_ALLOW_USB_TRANSPORT;
  });

  it('drops loopback/USB profiles from the picker entirely', () => {
    const rows = dedupePickerProfilesById([USB, TS, LAN]);
    expect(rows.map((p) => p.id)).toEqual(['ts', 'lan']);
  });

  it('never emits USB copy, even with a cable physically plugged in', () => {
    for (const p of [TS, LAN]) {
      const lines = profilePickerLines(p, { cablePluggedIn: true });
      expect(`${lines.title} ${lines.detail ?? ''}`).not.toMatch(/usb|cable/i);
    }
  });

  it('never labels the active route as USB', () => {
    expect(profileConnectionRouteDisplayLabel(TS, false, { cablePluggedIn: true })).not.toMatch(/usb/i);
    expect(profileConnectionRouteDisplayLabel(LAN, true, { cablePluggedIn: true })).not.toMatch(/usb/i);
  });

  it('keeps a debugging escape hatch', () => {
    process.env.EXPO_PUBLIC_ALLOW_USB_TRANSPORT = '1';
    expect(isUsbTransportAllowed()).toBe(true);
    expect(dedupePickerProfilesById([USB, TS]).map((p) => p.id)).toEqual(['usb', 'ts']);
  });

  it('is OFF by default — the cable must not come back on its own', () => {
    expect(isUsbTransportAllowed()).toBe(false);
  });

  it('S55: header never labels loopback as USB when hatch is off', () => {
    // Pinned to the BEHAVIOUR this test is named for ("never says USB"), not to the
    // implementation detail of returning undefined. `toBeUndefined()` also erased the
    // connected signal the picker keys off, which PR #1232's review caught as a P2 —
    // see S56 below. Any non-USB label satisfies the rule this test exists to enforce.
    expect(
      resolveHeaderTransportLabel({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: true,
        health: {
          level: 'green',
          hostname: 'Igors-MacBook-Pro.local',
          checkedAt: '2026-07-30T00:00:00.000Z',
        },
      }),
    ).not.toMatch(/usb/i);
    expect(
      isUsbHeaderTransportAllowed({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: true,
        health: {
          level: 'green',
          hostname: 'Igors-MacBook-Pro.local',
          checkedAt: '2026-07-30T00:00:00.000Z',
        },
      }),
    ).toBe(false);
    const banner = formatMacConnectionRetryBanner({
      connectionState: 'disconnected',
      gatewayUrl: 'http://127.0.0.1:8642',
      machineLabel: 'Your computer',
    });
    expect(banner).not.toMatch(/USB/i);
  });

  it('S55: dogfood hatch may still show USB in header', () => {
    process.env.EXPO_PUBLIC_ALLOW_USB_TRANSPORT = '1';
    expect(
      resolveHeaderTransportLabel({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: true,
      }),
    ).toBe('USB');
  });
});

// --- Sentry release attribution -------------------------------------------------------
// Verified 2026-07-26 against App Store Connect + `eas build:list`: app.json said
// ios.buildNumber 17 while the App Store actually served build 24 (v1.3) and had 28 (v1.4)
// in review. Sentry `dist` read app.json, so a crash could not be attributed to the shipped
// binary. It must prefer the NATIVE build number.
describe('sentry release attribution', () => {
  it('prefers the native build number over the stale app.json value', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'services', 'telemetry.ts'),
      'utf8',
    );
    // native value first, app.json only as fallback
    expect(src).toMatch(/Constants\.nativeBuildVersion/);
    expect(src).toMatch(/BUILD_NUMBER\s*=\s*String\(Constants\.nativeBuildVersion[^)]*\)\s*\|\|/);
    // and it is still what Sentry reports as dist
    expect(src).toMatch(/dist:\s*BUILD_NUMBER/);
  });
});

// PR #1232 review P2 (chatgpt-codex-connector): suppressing the USB wording by
// returning `undefined` ALSO drops the connected signal, so
// resolveComputerPickerStatus skips its activeReachable branch and falls through to
// misleading help ("Paste your Mac's Tailscale IP") while the route is actually
// working — which would violate the PRODUCT LAW in connectionStatusContract.ts.
// Hide the cable, keep the signal.
describe('S56: a working loopback route stays "connected" without naming a cable', () => {
  it('returns a neutral transport label rather than undefined', () => {
    const label = resolveHeaderTransportLabel({
      gatewayUrl: 'http://127.0.0.1:8642',
      wifiConnected: true,
      health: { level: 'green', hostname: 'Igors-Mac-mini.local' } as never,
    });
    expect(label).toBeDefined();
    expect(label).not.toMatch(/usb/i);
    expect(label).toBe(DIRECT_LINK_TRANSPORT_LABEL);
  });

  it('the neutral label never contains the banned word', () => {
    expect(DIRECT_LINK_TRANSPORT_LABEL).not.toMatch(/usb/i);
  });

  it('a stale cellular reverse ghost still gets NO label', () => {
    // A ghost is a ghost regardless of the dogfood hatch: no live /health means the
    // route is not connected, so it must not receive a connected-looking label.
    expect(
      resolveHeaderTransportLabel({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        health: null,
      }),
    ).toBeUndefined();
  });
});
