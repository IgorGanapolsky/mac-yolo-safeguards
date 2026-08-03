/**
 * Four defects reported from Igor's real device (2026-07-30).
 *
 * 1. USB is still surfaced to users, violating the standing 2026-07-22 rule
 *    ("my app should not know about usb, it should only know about tailscale").
 * 2. Transport copy invented a false either/or ("Tailscale when you are away, or
 *    home Wi‑Fi when you are local"). Tailscale works everywhere, including at
 *    home; same-Wi‑Fi discovery is a convenience, not a requirement.
 * 3. ThumbGate.app promo must appear on unreachable connection surfaces (panel/Leash).
 * 4. The header showed the literal "Your computer" placeholder while the real
 *    machine name was already known.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import ConnectMacGate from '../components/ConnectMacGate';
import { greetingSubtitle, resolveGreetingTransportLabel } from '../components/ChatEmptyGreeting';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import { friendlyMacUnreachableMessage } from '../utils/chatErrors';
import { resolveChatMachineHeaderDisplay } from '../utils/chatMachineHeader';
import { formatGatewayHostLabel } from '../utils/gatewayEndpoint';
import { formatUsbHostMismatchMessage } from '../utils/gatewayProfilePicker';
import { describeGatewayFetchError } from '../utils/gatewayUrlPolicy';
import {
  formatLanScanResultDetail,
  formatLanScanResultLabel,
  isLoopbackOnlyScanReach,
} from '../utils/lanScanLabels';
import {
  freshUserConnectionBody,
  freshUserConnectionTitle,
  freshUserPrimaryActionLabel,
} from '../utils/freshUserOnboarding';
import { resolvePairQrPayloadDetailed } from '../utils/pairQrResolve';
import type { GatewayProfile } from '../types/gatewayProfile';

const mockUseGateway = jest.fn();

jest.mock('../context/GatewayContext', () => ({
  useGateway: () => mockUseGateway(),
}));

jest.mock('../services/haptics', () => ({
  haptics: { success: jest.fn(), warning: jest.fn(), light: jest.fn() },
}));

jest.mock('../services/productAnalytics', () => ({
  trackProductEvent: jest.fn().mockResolvedValue(undefined),
}));

function gateway(overrides = {}) {
  return {
    settings: { ...DEFAULT_GATEWAY_SETTINGS, connectionMode: 'gateway', demoMode: false },
    gatewayBootstrapPhase: 'idle',
    isGatewayReachable: false,
    bootstrapReady: true,
    profileScanning: false,
    profileScanProgress: null,
    profileScanResult: null,
    gatewayProfiles: [],
    activeGatewayProfile: null,
    effectiveGatewayUrl: '',
    applySetupDeepLink: jest.fn(),
    retryGatewayBootstrap: jest.fn(),
    scanForGatewayProfiles: jest.fn(),
    selectGatewayProfile: jest.fn().mockResolvedValue(true),
    tailscaleDiscoveries: [],
    tailscaleDiscoveryProbing: false,
    addDiscoveredTailscaleComputer: jest.fn(),
    probeTailscaleComputers: jest.fn(),
    addGatewayProfile: jest.fn(),
    patchSettings: jest.fn().mockResolvedValue(undefined),
    wifiConnected: true,
    ...overrides,
  };
}

const profile = (over: Partial<GatewayProfile> = {}): GatewayProfile => ({
  id: 'p1',
  gatewayUrl: 'http://100.87.85.85:8642',
  label: 'Igors-MacBook-Pro',
  addedAt: '2026-07-30T00:00:00.000Z',
  ...over,
});

// --- DEFECT 1: no user-visible USB anywhere in the copy we own ---------------------
describe('defect 1 — USB is never surfaced to the user', () => {
  it('keeps USB out of the chat empty-state greeting', () => {
    expect(greetingSubtitle('Your computer')).not.toMatch(/usb/i);
    expect(greetingSubtitle()).not.toMatch(/usb/i);
    expect(greetingSubtitle('Computer via USB')).not.toMatch(/usb/i);
  });

  it('never echoes a cable as the greeting transport chip', () => {
    expect(resolveGreetingTransportLabel('USB')).toBeUndefined();
    expect(resolveGreetingTransportLabel('USB · Igors-MacBook-Pro')).toBeUndefined();
    // Tailscale / Wi‑Fi chips still echo.
    expect(resolveGreetingTransportLabel('Tailscale')).toBe('Tailscale');
    expect(resolveGreetingTransportLabel('Home Wi‑Fi')).toBe('Home Wi‑Fi');
  });

  it('keeps USB out of the fresh-user connection surface', () => {
    expect(freshUserPrimaryActionLabel(true)).not.toMatch(/usb/i);
    expect(
      freshUserConnectionTitle({
        searching: false,
        showUsbFix: true,
        usbHostMismatch: false,
        cellularBlocksDirect: false,
        freshUser: false,
      }),
    ).not.toMatch(/usb/i);
    expect(
      freshUserConnectionBody({
        searching: false,
        healInFlight: false,
        healExhausted: true,
        freshUser: false,
        cellularBlocksDirect: false,
        showUsbFix: true,
        macLabel: 'Igors-MacBook-Pro',
      }),
    ).not.toMatch(/usb/i);
    expect(
      freshUserConnectionBody({
        searching: false,
        healInFlight: false,
        healExhausted: true,
        freshUser: false,
        cellularBlocksDirect: false,
        showUsbFix: false,
        tailscaleSearching: true,
      }),
    ).not.toMatch(/usb/i);
  });

  it('keeps USB out of scan results, endpoint labels and error copy', () => {
    expect(
      formatLanScanResultLabel({ foundCount: 1, lanCount: 0, tailscaleCount: 0, usbCount: 1 }),
    ).not.toMatch(/usb/i);
    expect(
      formatLanScanResultDetail({
        completedAtMs: 0,
        foundCount: 1,
        lanCount: 0,
        tailscaleCount: 0,
        usbCount: 1,
      }),
    ).not.toMatch(/usb/i);
    expect(
      formatGatewayHostLabel('http://127.0.0.1:8642', {
        hostname: 'Igors-MacBook-Pro',
      } as never),
    ).not.toMatch(/usb/i);
    expect(
      describeGatewayFetchError(new Error('Network request failed'), 'http://127.0.0.1:8642'),
    ).not.toMatch(/usb/i);
    expect(
      formatUsbHostMismatchMessage({
        usbHostLabel: 'Igors-Mac-mini',
        selectedProfileLabel: 'Igors-MacBook-Pro',
        matchingProfileId: 'p2',
      }),
    ).not.toMatch(/usb/i);
    expect(
      formatUsbHostMismatchMessage({
        usbHostLabel: 'Igors-Mac-mini',
        selectedProfileLabel: 'Igors-MacBook-Pro',
      }),
    ).not.toMatch(/usb/i);
  });

  it('keeps USB out of pair-QR rejection copy', async () => {
    const resolved = await resolvePairQrPayloadDetailed('http://127.0.0.1:8765/pair');
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.message).not.toMatch(/usb/i);
    }
  });
});

// --- DEFECT 2: no false away/home transport dichotomy ------------------------------
describe('defect 2 — transport copy does not claim Tailscale is only for away', () => {
  const FALSE_DICHOTOMY = /(tailscale[^.]{0,40}(when you are away|away from home))|((away from home)[^.]{0,40}tailscale)/i;

  it('does not frame Tailscale as an away-from-home fallback in the greeting', () => {
    const subtitle = greetingSubtitle('Your computer');
    expect(subtitle).not.toMatch(FALSE_DICHOTOMY);
    expect(subtitle).toMatch(/tailscale/i);
    expect(subtitle).toMatch(/anywhere/i);
  });

  it('does not frame Tailscale as an away-from-home fallback in unreachable errors', () => {
    expect(friendlyMacUnreachableMessage()).not.toMatch(FALSE_DICHOTOMY);
    expect(friendlyMacUnreachableMessage()).toMatch(/anywhere/i);
    expect(friendlyMacUnreachableMessage('http://192.168.1.10:8642')).not.toMatch(FALSE_DICHOTOMY);
    expect(friendlyMacUnreachableMessage('http://192.168.1.10:8642')).toMatch(/anywhere/i);
  });

  it('keeps the Settings machines blurb free of the false dichotomy', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'screens', 'SettingsScreen.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/Away from home, use Tailscale/);
  });
});

// --- DEFECT 3: ThumbGate promo surfaces when Mac is unreachable -------------
// Product SSOT (2026-07+): promo lives on ChatConnectionPanel / Leash, not inside
// ConnectMacGate (connect flow stays uncluttered). Still enforce promo exists in app.
describe('defect 3 — ThumbGate promo on unreachable connection surfaces', () => {
  afterEach(() => jest.clearAllMocks());

  it('ConnectMacGate stays focused on connect (no promo slot)', () => {
    mockUseGateway.mockReturnValue(
      gateway({
        settings: { ...DEFAULT_GATEWAY_SETTINGS, demoMode: false },
        gatewayProfiles: [],
        effectiveGatewayUrl: '',
      }),
    );
    const view = render(<ConnectMacGate />);
    expect(view.getByTestId('connect-mac-gate')).toBeTruthy();
    expect(view.queryByTestId('thumbgate-promo-connection_unreachable')).toBeNull();
  });

  it('ChatConnectionPanel shows promo with open CTA when disconnected', () => {
    const ChatConnectionPanel = require('../components/ChatConnectionPanel').default;
    const view = render(
      <ChatConnectionPanel connectionState="disconnected" onSearchMac={jest.fn()} profiles={[]} />,
    );
    expect(view.getByTestId('thumbgate-promo-connection_unreachable')).toBeTruthy();
    expect(view.getByTestId('thumbgate-promo-open')).toBeTruthy();
    const promo = view.getByTestId('thumbgate-promo-connection_unreachable');
    const flat = require('react-native').StyleSheet.flatten(promo.props.style) ?? {};
    expect(flat.height).not.toBe(0);
    expect(flat.maxHeight).not.toBe(0);
    expect(flat.display).not.toBe('none');
  });
});

// --- DEFECT 4: real machine name beats the "Your computer" placeholder -------------
describe('defect 4 — header uses the known machine name, not the placeholder', () => {
  const base = {
    gatewayUrl: '',
    health: null,
    connectionMode: 'relay' as const,
    isPaired: false,
    workers: [],
    profiles: [],
  };

  it('uses the relay worker name while approval pairing is still pending', () => {
    const display = resolveChatMachineHeaderDisplay({
      ...base,
      workers: [{ id: 'w1', label: 'Igors-MacBook-Pro', status: 'online' }],
    });
    expect(display.machineLabel).toBe('Igors-MacBook-Pro');
  });

  it('uses the single saved computer name when nothing is active yet', () => {
    const display = resolveChatMachineHeaderDisplay({
      ...base,
      profiles: [profile()],
    });
    expect(display.machineLabel).toBe('Igors-MacBook-Pro');
  });

  it('uses a live /health hostname when that is all we know', () => {
    const display = resolveChatMachineHeaderDisplay({
      ...base,
      health: { level: 'green', hostname: 'Igors-Mac-mini' } as never,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
  });

  it('still falls back to the placeholder when nothing identifies the machine', () => {
    expect(resolveChatMachineHeaderDisplay({ ...base }).machineLabel).toBe('Your computer');
  });

  it('does not guess between two saved computers', () => {
    const display = resolveChatMachineHeaderDisplay({
      ...base,
      profiles: [profile(), profile({ id: 'p2', label: 'Igors-Mac-mini' })],
    });
    expect(display.machineLabel).toBe('Your computer');
  });

  // PR #1229 review (P1): live proof outranks an unselected saved profile.
  it('prefers a live green /health hostname over an unselected saved profile', () => {
    const display = resolveChatMachineHeaderDisplay({
      ...base,
      profiles: [profile({ id: 'mini', label: 'Igors-Mac-mini' })],
      health: { level: 'green', hostname: 'Igors-MacBook-Pro' } as never,
    });
    expect(display.machineLabel).toBe('Igors-MacBook-Pro');
  });

  it('falls back to the saved profile when health is not live proof', () => {
    const display = resolveChatMachineHeaderDisplay({
      ...base,
      profiles: [profile({ id: 'mini', label: 'Igors-Mac-mini' })],
      health: { level: 'red', hostname: 'Igors-MacBook-Pro' } as never,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
  });
});

// PR #1229 review (P2): a mixed scan is not a loopback-only scan.
describe('isLoopbackOnlyScanReach', () => {
  it('is true only when every found computer came over loopback', () => {
    expect(
      isLoopbackOnlyScanReach({ foundCount: 2, lanCount: 0, tailscaleCount: 0, usbCount: 2 }),
    ).toBe(true);
  });

  it('is false when the scan also found a route with no dedicated counter', () => {
    expect(
      isLoopbackOnlyScanReach({ foundCount: 2, lanCount: 0, tailscaleCount: 0, usbCount: 1 }),
    ).toBe(false);
  });

  it('is false for LAN / Tailscale / empty scans', () => {
    expect(
      isLoopbackOnlyScanReach({ foundCount: 1, lanCount: 1, tailscaleCount: 0, usbCount: 1 }),
    ).toBe(false);
    expect(
      isLoopbackOnlyScanReach({ foundCount: 1, lanCount: 0, tailscaleCount: 1, usbCount: 1 }),
    ).toBe(false);
    expect(isLoopbackOnlyScanReach({ foundCount: 0, usbCount: 0 })).toBe(false);
  });
});
