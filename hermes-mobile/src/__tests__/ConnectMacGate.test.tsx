import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ConnectMacGate, { connectMacGateCardMaxWidth } from '../components/ConnectMacGate';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import { CONNECT_MAC_GATE_TITLE, TAILSCALE_PASTE_IP_TITLE } from '../utils/tailscalePasteIpCopy';

const mockUseGateway = jest.fn();

jest.mock('../context/GatewayContext', () => ({
  useGateway: () => mockUseGateway(),
}));

jest.mock('../services/haptics', () => ({
  haptics: {
    success: jest.fn(),
    warning: jest.fn(),
    light: jest.fn(),
  },
}));

function gateway(overrides = {}) {
  return {
    settings: {
      ...DEFAULT_GATEWAY_SETTINGS,
      connectionMode: 'gateway',
      demoMode: false,
    },
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

describe('ConnectMacGate', () => {
  const originalE2e = process.env.EXPO_PUBLIC_E2E_AUTOMATION;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalE2e === undefined) {
      delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    } else {
      process.env.EXPO_PUBLIC_E2E_AUTOMATION = originalE2e;
    }
  });

  it('shows paste-IP hero and Find computers for fresh unpaired relay defaults', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        settings: {
          ...DEFAULT_GATEWAY_SETTINGS,
          demoMode: false,
        },
        gatewayProfiles: [],
        effectiveGatewayUrl: '',
      }),
    );
    const view = render(<ConnectMacGate />);
    expect(DEFAULT_GATEWAY_SETTINGS.connectionMode).toBe('relay');
    expect(view.getByTestId('connect-mac-gate')).toBeTruthy();
    expect(view.getByTestId('connect-mac-onboarding-card')).toBeTruthy();
    expect(view.getByText(CONNECT_MAC_GATE_TITLE)).toBeTruthy();
    expect(view.getByText(TAILSCALE_PASTE_IP_TITLE)).toBeTruthy();
    expect(view.getByTestId('connect-manual-input')).toBeTruthy();
    expect(view.getByTestId('connect-search-wifi')).toBeTruthy();
    expect(view.queryByTestId('fresh-user-step-1')).toBeNull();
  });

  it('keeps paste hero + Find computers visible during silent bootstrap booting', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        settings: {
          ...DEFAULT_GATEWAY_SETTINGS,
          demoMode: false,
        },
        gatewayBootstrapPhase: 'booting',
        gatewayProfiles: [],
        effectiveGatewayUrl: '',
      }),
    );
    const view = render(<ConnectMacGate />);
    expect(view.getByTestId('connect-mac-gate')).toBeTruthy();
    expect(view.getByTestId('connect-mac-onboarding-card')).toBeTruthy();
    expect(view.getByTestId('connect-search-wifi')).toBeTruthy();
    expect(view.getByTestId('connect-mac-scan-status')).toBeTruthy();
  });

  it('keeps paste hero visible while profileScanning (stranger cold-start)', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        settings: {
          ...DEFAULT_GATEWAY_SETTINGS,
          demoMode: false,
        },
        profileScanning: true,
        profileScanProgress: {
          stage: 'gateway_health',
          completedHosts: 3,
          totalHosts: 100,
          foundCount: 0,
        },
        gatewayProfiles: [],
        effectiveGatewayUrl: '',
      }),
    );
    const view = render(<ConnectMacGate />);
    expect(view.getByTestId('connect-mac-gate')).toBeTruthy();
    expect(view.getByTestId('connect-mac-onboarding-card')).toBeTruthy();
    expect(view.getByTestId('connect-search-wifi')).toBeTruthy();
    expect(view.getByTestId('connect-mac-scan-status')).toBeTruthy();
  });

  it('shows first-run computer setup when no machine is reachable or saved', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(gateway());

    const view = render(<ConnectMacGate />);

    expect(view.getByTestId('connect-mac-gate')).toBeTruthy();
    expect(view.getByText(CONNECT_MAC_GATE_TITLE)).toBeTruthy();
    expect(view.getByTestId('connect-mac-gate-dismiss')).toBeTruthy();
  });

  it('does not treat the unreachable USB loopback placeholder as a saved computer', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        settings: {
          ...DEFAULT_GATEWAY_SETTINGS,
          connectionMode: 'gateway',
          demoMode: false,
          gatewayUrl: 'http://127.0.0.1:8642',
        },
        gatewayProfiles: [
          {
            id: 'mac_usb_loopback',
            label: 'Computer via USB',
            gatewayUrl: 'http://127.0.0.1:8642',
            addedAt: '2026-07-12T00:00:00.000Z',
          },
        ],
        effectiveGatewayUrl: 'http://127.0.0.1:8642',
      }),
    );

    const view = render(<ConnectMacGate />);

    expect(view.getByTestId('connect-mac-gate')).toBeTruthy();
    expect(view.getByTestId('connect-mac-onboarding-card')).toBeTruthy();
  });

  it('does not cover Chat during explicit E2E automation bootstrap', () => {
    process.env.EXPO_PUBLIC_E2E_AUTOMATION = '1';
    mockUseGateway.mockReturnValue(gateway());

    const view = render(<ConnectMacGate />);

    expect(view.queryByTestId('connect-mac-gate')).toBeNull();
  });

  it('persists dismiss so the gate does not immediately re-trap', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    const patchSettings = jest.fn().mockResolvedValue(undefined);
    mockUseGateway.mockReturnValue(gateway({ patchSettings }));

    const view = render(<ConnectMacGate />);
    fireEvent.press(view.getByTestId('connect-mac-gate-dismiss'));

    expect(patchSettings).toHaveBeenCalledWith({ connectMacGateDismissed: true });
  });

  it('hides the gate after the user has dismissed it', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        settings: {
          ...DEFAULT_GATEWAY_SETTINGS,
          connectionMode: 'gateway',
          demoMode: false,
          connectMacGateDismissed: true,
        },
      }),
    );

    const view = render(<ConnectMacGate />);
    expect(view.queryByTestId('connect-mac-gate')).toBeNull();
  });

  it('does not yank Chat when saved computers exist but are briefly unreachable', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        isGatewayReachable: false,
        gatewayProfiles: [
          {
            id: 'mac-mini',
            label: 'Mac mini',
            gatewayUrl: 'http://192.168.1.50:8642',
            localIp: '192.168.1.50',
            addedAt: '2026-07-15T00:00:00.000Z',
          },
          {
            id: 'macbook-pro',
            label: 'MacBook Pro',
            gatewayUrl: 'http://100.87.85.85:8642',
            localIp: '100.87.85.85',
            addedAt: '2026-07-15T00:00:00.000Z',
          },
        ],
        effectiveGatewayUrl: 'http://100.87.85.85:8642',
      }),
    );

    const view = render(<ConnectMacGate />);
    expect(view.queryByTestId('connect-mac-gate')).toBeNull();
  });

  it('hides the gate when dismissal is persisted during an active scan', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        profileScanning: true,
        settings: {
          ...gateway().settings,
          connectMacGateDismissed: true,
        },
      }),
    );

    const view = render(<ConnectMacGate />);

    expect(view.queryByTestId('connect-mac-gate')).toBeNull();
  });

  it('does not claim a computer is found when an in-flight reach count has no connectable row', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        profileScanning: true,
        profileScanProgress: {
          stage: 'gateway_health',
          completedHosts: 19,
          totalHosts: 100,
          foundCount: 1,
        },
      }),
    );

    const view = render(<ConnectMacGate />);

    expect(view.getByTestId('connect-mac-scan-status')).toBeTruthy();
    expect(view.queryByText(/1 computer so far/)).toBeNull();
    expect(view.queryByTestId('connect-mac-found-machines')).toBeNull();
  });

  it('renders and selects a connectable computer immediately during a scan', async () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    const selectGatewayProfile = jest.fn().mockResolvedValue(true);
    const retryGatewayBootstrap = jest.fn().mockResolvedValue(true);
    const profile = {
      id: 'mac-mini',
      label: 'Mac mini',
      gatewayUrl: 'http://192.168.1.50:8642',
      localIp: '192.168.1.50',
      addedAt: '2026-07-15T00:00:00.000Z',
    };
    mockUseGateway.mockReturnValue(
      gateway({
        profileScanning: true,
        profileScanProgress: {
          stage: 'gateway_health',
          completedHosts: 19,
          totalHosts: 100,
          foundCount: 1,
        },
      }),
    );
    const view = render(<ConnectMacGate />);

    mockUseGateway.mockReturnValue(
      gateway({
        profileScanning: true,
        profileScanProgress: {
          stage: 'gateway_health',
          completedHosts: 19,
          totalHosts: 100,
          foundCount: 1,
        },
        gatewayProfiles: [profile],
        selectGatewayProfile,
        retryGatewayBootstrap,
      }),
    );
    view.rerender(<ConnectMacGate />);
    expect(view.getByTestId('connect-mac-gate')).toBeTruthy();
    expect(view.getByTestId('connect-mac-found-machines')).toBeTruthy();

    fireEvent.press(view.getByTestId('select-gateway-profile-mac-mini'));

    expect(selectGatewayProfile).toHaveBeenCalledWith('mac-mini', {
      ensureProfile: profile,
    });
    await Promise.resolve();
    expect(retryGatewayBootstrap).toHaveBeenCalledTimes(1);
  });

  it('uses cellular one-liner when not on Wi-Fi', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(gateway({ wifiConnected: false }));

    const view = render(<ConnectMacGate />);

    expect(view.getByText(/Paste your Mac’s Tailscale IP — works on cellular/)).toBeTruthy();
    expect(view.queryByText('Same home Wi‑Fi')).toBeNull();
    expect(view.queryByText('Use Tailscale from cellular')).toBeNull();
  });

  it('promotes Tailscale candidates and demotes QR / competing Wi-Fi loaders', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        profileScanning: true,
        tailscaleDiscoveryProbing: true,
        tailscaleDiscoveries: [
          {
            gatewayUrl: 'http://100.94.135.78:8642',
            hostname: 'Igors-Mac-mini.local',
            label: 'Igors-Mac-mini',
          },
          {
            gatewayUrl: 'http://100.87.85.85:8642',
            hostname: 'Igors-MacBook-Pro.local',
            label: 'Igors-MacBook-Pro',
          },
        ],
      }),
    );

    const view = render(<ConnectMacGate />);

    expect(view.getByTestId('tailscale-discovery-banner')).toBeTruthy();
    expect(view.getByText('Add Igors-Mac-mini')).toBeTruthy();
    expect(view.getByText('Add Igors-MacBook-Pro')).toBeTruthy();
    expect(view.queryByText('Adding…')).toBeNull();
    expect(view.queryByTestId('connect-mac-scan-progress')).toBeNull();
    expect(view.queryByTestId('connect-search-wifi')).toBeNull();
    expect(view.queryByTestId('connect-scan-qr')).toBeNull();
  });

  it('keeps the phone-sized card on narrow windows', () => {
    expect(connectMacGateCardMaxWidth(375)).toBe(420);
    expect(connectMacGateCardMaxWidth(699)).toBe(420);
  });

  it('widens the card on tablet-sized windows without going edge to edge', () => {
    // iPad portrait (~834pt): wider than phone, nowhere near full width.
    expect(connectMacGateCardMaxWidth(834)).toBe(459);
    // iPad Pro landscape (~1366pt): capped, never edge to edge.
    expect(connectMacGateCardMaxWidth(1366)).toBe(640);
  });

  it('Find computers triggers a forced Tailscale probe, not just the LAN sweep (away-from-home gap)', async () => {
    // Regression for the live bug: on cellular with no LAN peers and no
    // recently-cached Tailscale hosts, tapping "Find computers" only ran the
    // LAN-only scanForGatewayProfiles() and reported "None found yet" even
    // though a genuine Tailscale probe would have found the Mac. The fix
    // wires probeTailscaleComputers({ force: true }) into the same tap so
    // it searches everywhere Hermes can reach a Mac, cellular included.
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    const scanForGatewayProfiles = jest.fn().mockResolvedValue([]);
    const probeTailscaleComputers = jest.fn().mockResolvedValue(undefined);
    const retryGatewayBootstrap = jest.fn().mockResolvedValue(undefined);
    mockUseGateway.mockReturnValue(
      gateway({
        settings: {
          ...DEFAULT_GATEWAY_SETTINGS,
          demoMode: false,
        },
        wifiConnected: false, // away from home / on cellular
        gatewayProfiles: [],
        effectiveGatewayUrl: '',
        tailscaleDiscoveries: [],
        scanForGatewayProfiles,
        probeTailscaleComputers,
        retryGatewayBootstrap,
      }),
    );

    const view = render(<ConnectMacGate />);

    // Before the fix, mount only fires the un-forced/default probe via the
    // separate useEffect; clear that call so we can prove the button press
    // itself performs a *forced* probe.
    probeTailscaleComputers.mockClear();

    fireEvent.press(view.getByTestId('connect-search-wifi'));

    await waitFor(() => {
      expect(scanForGatewayProfiles).toHaveBeenCalledTimes(1);
      expect(probeTailscaleComputers).toHaveBeenCalledTimes(1);
    });

    // The Tailscale probe triggered by the tap must be forced (bypass the
    // 30s background cadence gate) and visible in the UI, not the silent
    // best-effort background variant scanForGatewayProfiles's own finally
    // block fires internally.
    expect(probeTailscaleComputers).toHaveBeenCalledWith({ showUi: true, force: true });
  });
});
