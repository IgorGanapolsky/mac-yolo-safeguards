import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
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
  },
}));

function gateway(overrides = {}) {
  return {
    settings: {
      ...DEFAULT_GATEWAY_SETTINGS,
      connectionMode: 'gateway',
      demoMode: false,
      connectMacGateDismissed: false,
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
    wifiConnected: true,
    applySetupDeepLink: jest.fn(),
    retryGatewayBootstrap: jest.fn(),
    scanForGatewayProfiles: jest.fn(),
    tailscaleDiscoveries: [],
    tailscaleDiscoveryProbing: false,
    addDiscoveredTailscaleComputer: jest.fn(),
    probeTailscaleComputers: jest.fn(),
    addGatewayProfile: jest.fn(),
    patchSettings: jest.fn().mockResolvedValue(undefined),
    selectGatewayProfile: jest.fn().mockResolvedValue(true),
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

  it('shows Not now dismiss and persists connectMacGateDismissed', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    const patchSettings = jest.fn().mockResolvedValue(undefined);
    mockUseGateway.mockReturnValue(gateway({ patchSettings }));

    const view = render(<ConnectMacGate />);

    expect(view.getByTestId('connect-mac-gate-dismiss')).toBeTruthy();
    fireEvent.press(view.getByTestId('connect-mac-gate-dismiss'));
    expect(patchSettings).toHaveBeenCalledWith({ connectMacGateDismissed: true });
  });

  it('hides gate when user previously dismissed it', () => {
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

  it('hides gate once non-loopback computers are discovered', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(
      gateway({
        gatewayProfiles: [
          {
            id: 'mbp',
            label: 'Igors-MacBook-Pro',
            gatewayUrl: 'http://192.168.1.10:8642',
            addedAt: '2026-07-14T00:00:00.000Z',
          },
          {
            id: 'mini',
            label: 'Igors-Mac-mini',
            gatewayUrl: 'http://100.94.135.78:8642',
            addedAt: '2026-07-14T00:00:00.000Z',
          },
        ],
        profileScanResult: { foundCount: 2, completedAtMs: Date.now() },
      }),
    );

    const view = render(<ConnectMacGate />);

    expect(view.queryByTestId('connect-mac-gate')).toBeNull();
  });
});
