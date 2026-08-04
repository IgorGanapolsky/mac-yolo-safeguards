/**
 * CEO law (2026-07-26 restated 2026-07-30): the product must never show the word "USB"
 * to users. Internal identifiers (USB_LOOPBACK_*, isUsbTransportAllowed, stage ids) may
 * keep the technical name — only rendered copy is banned.
 */
import {
  DIRECT_LINK_TRANSPORT_LABEL,
  resolveHeaderTransportLabel,
  resolveChatMachineHeaderDisplay,
  formatMacConnectionRetryBanner,
} from '../utils/chatMachineHeader';
import {
  formatUsbHostMismatchMessage,
  profileConnectionRouteDisplayLabel,
  profilePickerLines,
  isUsbTransportAllowed,
} from '../utils/gatewayProfilePicker';
import { GENERIC_USB_PROFILE_LABEL } from '../services/gatewayProfiles';
import type { GatewayProfile } from '../types/gatewayProfile';

const loopbackProfile = (id = 'usb'): GatewayProfile => ({
  id,
  gatewayUrl: 'http://127.0.0.1:8642',
  label: 'Igors-MacBook-Pro',
  addedAt: '2026-07-30T00:00:00.000Z',
});

const liveHealth = {
  level: 'green' as const,
  status: 'ok',
  gatewayState: 'running' as const,
  checkedAt: '2026-07-30T00:00:00.000Z',
  hostname: 'Igors-MacBook-Pro.local',
};

describe('no USB user-facing copy (CEO 2026-07-30)', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_ALLOW_USB_TRANSPORT;
  });

  it('header transport never returns the word USB (default product)', () => {
    const label = resolveHeaderTransportLabel({
      gatewayUrl: 'http://127.0.0.1:8642',
      wifiConnected: true,
      health: liveHealth,
    });
    expect(label).toBe(DIRECT_LINK_TRANSPORT_LABEL);
    expect(label).not.toMatch(/usb/i);
  });

  it('header transport never returns USB even with dogfood hatch', () => {
    process.env.EXPO_PUBLIC_ALLOW_USB_TRANSPORT = '1';
    const label = resolveHeaderTransportLabel({
      gatewayUrl: 'http://127.0.0.1:8642',
      wifiConnected: true,
      health: liveHealth,
    });
    expect(label).toBe(DIRECT_LINK_TRANSPORT_LABEL);
    expect(label).not.toMatch(/usb/i);
  });

  it('chat header display line never embeds USB', () => {
    const display = resolveChatMachineHeaderDisplay({
      gatewayUrl: 'http://127.0.0.1:8642',
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      wifiConnected: true,
      health: liveHealth,
      savedMacCount: 1,
    });
    const line = [display.machineLabel, display.machineEndpoint].filter(Boolean).join(' · ');
    expect(line).not.toMatch(/usb/i);
    expect(display.machineEndpoint).toBe(DIRECT_LINK_TRANSPORT_LABEL);
  });

  it('retry banner never embeds USB', () => {
    const banner = formatMacConnectionRetryBanner({
      connectionState: 'disconnected',
      gatewayUrl: 'http://127.0.0.1:8642',
      health: liveHealth,
    });
    expect(banner).not.toMatch(/usb/i);
    expect(banner).toContain(DIRECT_LINK_TRANSPORT_LABEL);
  });

  it('generic loopback profile label never says USB', () => {
    expect(GENERIC_USB_PROFILE_LABEL).not.toMatch(/usb/i);
    expect(GENERIC_USB_PROFILE_LABEL).toBe('Your computer');
  });

  it('picker/display labels never emit USB (hatch on or off)', () => {
    for (const hatch of [undefined, '1'] as const) {
      if (hatch) {
        process.env.EXPO_PUBLIC_ALLOW_USB_TRANSPORT = hatch;
      } else {
        delete process.env.EXPO_PUBLIC_ALLOW_USB_TRANSPORT;
      }
      const p = loopbackProfile();
      const lines = profilePickerLines(p, { cablePluggedIn: true });
      const route = profileConnectionRouteDisplayLabel(p, true, { cablePluggedIn: true });
      expect(`${lines.title} ${lines.detail ?? ''}`).not.toMatch(/usb/i);
      expect(route).not.toMatch(/usb/i);
      if (isUsbTransportAllowed()) {
        expect(route).toBe('Direct link');
      }
    }
  });

  it('host-mismatch message never names USB', () => {
    const msg = formatUsbHostMismatchMessage({
      usbHostLabel: 'Igors-MacBook-Pro',
      selectedProfileLabel: 'Mac mini',
      matchingProfileId: 'mac_book',
    });
    expect(msg).not.toMatch(/usb/i);
  });
});
