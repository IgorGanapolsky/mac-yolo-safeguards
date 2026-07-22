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

  it('shows the gate for fresh unpaired relay defaults (product cold start)', () => {
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
    fireEvent.press(view.getByTestId('connect-other-ways-toggle'));
    expect(view.getByTestId('connect-mac-onboarding-card')).toBeTruthy();
  });

  it('keeps onboarding + Find computers visible during silent bootstrap booting', () => {
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
    expect(view.getByTestId('connect-mac-scan-progress')).toBeTruthy();
  });

  it('keeps onboarding + Find computers visible while profileScanning (stranger cold-start)', () => {
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
    expect(view.getByTestId('connect-mac-scan-progress')).toBeTruthy();
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

    expect(view.getByText('Checking direct Hermes links (19%)')).toBeTruthy();
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
    expect(view.getByText(/1 computer so far/)).toBeTruthy();

    fireEvent.press(view.getByTestId('select-gateway-profile-mac-mini'));

    expect(selectGatewayProfile).toHaveBeenCalledWith('mac-mini', {
      ensureProfile: profile,
    });
    await Promise.resolve();
    expect(retryGatewayBootstrap).toHaveBeenCalledTimes(1);
  });

  it('uses cellular onboarding copy when not on Wi-Fi', () => {
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    mockUseGateway.mockReturnValue(gateway({ wifiConnected: false }));

    const view = render(<ConnectMacGate />);

    fireEvent.press(view.getByTestId('connect-other-ways-toggle'));
    expect(view.getByText('Use Tailscale from cellular')).toBeTruthy();
    expect(view.queryByText('Same home Wi‑Fi')).toBeNull();
    expect(
      view.getByText(
        /On cellular, use Tailscale to reach your Mac/,
      ),
    ).toBeTruthy();
  });
});
