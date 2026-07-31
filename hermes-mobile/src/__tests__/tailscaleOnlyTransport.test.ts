import {
  dedupePickerProfilesById,
  profilePickerLines,
  profileConnectionRouteDisplayLabel,
  isUsbTransportAllowed,
} from '../utils/gatewayProfilePicker';
import type { GatewayProfile } from '../types/gatewayProfile';

// CEO directive 2026-07-26: "my app should not know about USB, it should only know about
// tailscale." A live adb reverse makes the phone reach the Mac over loopback, which MASKS the
// real tailnet state — so the picker presented a cable as a peer of Tailscale.
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
