import React from 'react';
import { render } from '@testing-library/react-native';
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
    },
    gatewayBootstrapPhase: 'idle',
    isGatewayReachable: false,
    bootstrapReady: true,
    profileScanning: false,
    profileScanProgress: null,
    profileScanResult: null,
    gatewayProfiles: [],
    effectiveGatewayUrl: '',
    applySetupDeepLink: jest.fn(),
    retryGatewayBootstrap: jest.fn(),
    scanForGatewayProfiles: jest.fn(),
    tailscaleDiscoveries: [],
    tailscaleDiscoveryProbing: false,
    addDiscoveredTailscaleComputer: jest.fn(),
    probeTailscaleComputers: jest.fn(),
    addGatewayProfile: jest.fn(),
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

  it('does not cover Chat during explicit E2E automation bootstrap', () => {
    process.env.EXPO_PUBLIC_E2E_AUTOMATION = '1';
    mockUseGateway.mockReturnValue(gateway());

    const view = render(<ConnectMacGate />);

    expect(view.queryByTestId('connect-mac-gate')).toBeNull();
  });
});
