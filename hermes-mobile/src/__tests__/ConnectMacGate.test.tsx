import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ConnectMacGate from '../components/ConnectMacGate';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

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

  it('shows first-run computer setup when no machine is reachable or saved', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(gateway());

    const view = render(<ConnectMacGate />);

    expect(view.getByTestId('connect-mac-gate')).toBeTruthy();
    expect(view.getAllByText('Connect your computer').length).toBeGreaterThan(0);
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

  it('shows first-run gate on default relay mode (brand-new install)', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        settings: {
          ...DEFAULT_GATEWAY_SETTINGS,
          // DEFAULT is relay — gate must still appear for strangers
          connectionMode: 'relay',
          demoMode: false,
          gatewayUrl: 'http://127.0.0.1:8642',
        },
        gatewayProfiles: [
          {
            id: 'mac_usb_loopback',
            label: 'Computer via USB',
            gatewayUrl: 'http://127.0.0.1:8642',
            addedAt: '2026-07-15T00:00:00.000Z',
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

  it('renders tappable machine rows when scan finds computers', async () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    const selectGatewayProfile = jest.fn().mockResolvedValue(true);
    const retryGatewayBootstrap = jest.fn().mockResolvedValue(true);
    mockUseGateway.mockReturnValue(
      gateway({
        profileScanResult: { foundCount: 2, completedAtMs: Date.now() },
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
        selectGatewayProfile,
        retryGatewayBootstrap,
      }),
    );

    const view = render(<ConnectMacGate />);

    expect(view.getByTestId('connect-mac-found-machines')).toBeTruthy();
    expect(view.getByTestId('select-gateway-profile-mac-mini')).toBeTruthy();
    fireEvent.press(view.getByTestId('select-gateway-profile-mac-mini'));
    await waitFor(() => {
      expect(selectGatewayProfile).toHaveBeenCalled();
      expect(retryGatewayBootstrap).toHaveBeenCalled();
    });
  });

  it('uses cellular onboarding copy when not on Wi-Fi', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(gateway({ wifiConnected: false }));

    const view = render(<ConnectMacGate />);

    expect(view.getByText('Use Tailscale from cellular')).toBeTruthy();
    expect(view.queryByText('Same home Wi‑Fi')).toBeNull();
    expect(
      view.getByText(
        /On cellular, use Tailscale — we also search when you are on home Wi‑Fi/,
      ),
    ).toBeTruthy();
  });
});
