import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../screens/SettingsScreen';
import { mockGatewaySettings, mockUseGateway } from '../testUtils/gatewayFixtures';

jest.mock('../services/approvalNotifications', () => ({
  requestHermesNotificationPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('../context/GatewayContext', () => ({
  useGateway: jest.fn(),
}));

jest.mock('../services/haptics', () => ({
  haptics: {
    light: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

jest.mock('../native/hermesGlasses', () => ({
  isGlassesConnected: jest.fn().mockResolvedValue(false),
  launchHermesOnGlasses: jest.fn(),
}));

jest.mock('../services/secureCredentials', () => ({
  secureCredentials: {
    loadThumbgateApiKey: jest.fn().mockResolvedValue(''),
  },
}));

jest.mock('../services/hermesGatewayClient', () => ({
  getCapabilities: jest.fn().mockResolvedValue({ features: {} }),
  listSkills: jest.fn().mockResolvedValue([]),
  listJobs: jest.fn().mockResolvedValue([]),
  listToolsets: jest.fn().mockResolvedValue([]),
  pauseJob: jest.fn(),
  resumeJob: jest.fn(),
  runJobNow: jest.fn(),
  deleteJob: jest.fn(),
  setToolsetEnabled: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => callback(), [callback]);
    },
  };
});

const { useGateway } = jest.requireMock('../context/GatewayContext');

jest.mock('../utils/demoModePolicy', () => ({
  isDemoModeAllowed: jest.fn(() => false),
}));

const { isDemoModeAllowed } = jest.requireMock('../utils/demoModePolicy');

describe('SettingsScreen', () => {
  beforeEach(() => {
    isDemoModeAllowed.mockReturnValue(false);
    useGateway.mockReturnValue(mockUseGateway());
  });

  it('renders settings header and gateway inputs', async () => {
    const { getByTestId, getByText } = render(<SettingsScreen />);
    expect(getByTestId('SETTINGS')).toBeTruthy();
    expect(getByText('Pair Hermes Relay, choose active machines, and run local fallback ops')).toBeTruthy();
    expect(getByTestId('GATEWAY_OPS')).toBeTruthy();
    expect(getByTestId('gateway-url-input')).toBeTruthy();
    expect(getByTestId('gateway-api-key-input')).toBeTruthy();
  });

  it('shows account relay as the default unpaired route in relay mode', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: {
          ...mockGatewaySettings,
          connectionMode: 'relay',
        },
        isPaired: false,
      }),
    );

    const { getByTestId } = render(<SettingsScreen />);
    expect(getByTestId('relay-route-title').props.children).toBe('Hermes account relay');
    expect(getByTestId('relay-route-status').props.children.join('')).toContain('Pair relay in Settings');
  });

  it('shows active relay workers when the account relay reports them', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: {
          ...mockGatewaySettings,
          connectionMode: 'relay',
        },
        isPaired: true,
        relayWorkers: [
          {
            id: 'mac-mini',
            hostname: 'Igors-Mac-mini.local',
            project: 'skool_top1percent',
            status: 'online',
          },
        ],
        activeRelayWorkerId: 'mac-mini',
      }),
    );

    const { getByTestId, getByText } = render(<SettingsScreen />);
    expect(getByTestId('relay-route-title').props.children).toBe(
      'Igors-Mac-mini · skool_top1percent',
    );
    expect(getByText('online')).toBeTruthy();
  });

  it('saves configuration', async () => {
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    useGateway.mockReturnValue(mockUseGateway({ saveSettings }));

    const { getByTestId } = render(<SettingsScreen />);
    fireEvent.changeText(getByTestId('gateway-url-input'), 'http://192.168.12.208:8642');
    fireEvent.changeText(getByTestId('gateway-api-key-input'), 'sk-new-key');
    fireEvent.press(getByTestId('persona-spark'));
    fireEvent.press(getByTestId('avatar-guardian'));
    fireEvent(getByTestId('playful-motion-switch'), 'valueChange', false);
    fireEvent.press(getByTestId('save-settings-button'));

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalled();
    });
    expect(saveSettings.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        hermesPersona: 'spark',
        hermesAvatar: 'guardian',
        playfulMotion: false,
      }),
    );
  });

  it('does not render Pro subscribe UI', () => {
    const { queryByTestId } = render(<SettingsScreen />);
    expect(queryByTestId('unlock-thumbgate-leash')).toBeNull();
  });

  it('shows Demo mode toggle when store review demo is allowed', () => {
    isDemoModeAllowed.mockReturnValue(true);

    const { getByTestId, getByText, queryByTestId } = render(<SettingsScreen />);
    expect(getByText('Demo mode')).toBeTruthy();
    expect(getByTestId('demo-mode-switch')).toBeTruthy();
    expect(queryByTestId('inject-mock-approval')).toBeNull();
  });

  it('shows cellular tunnel wizard when off Wi-Fi with LAN profile', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        wifiConnected: false,
        effectiveGatewayUrl: 'http://192.168.12.208:8642',
        settings: {
          ...mockGatewaySettings,
          gatewayUrl: 'http://192.168.12.208:8642',
        },
      }),
    );

    const { getByTestId, getByText } = render(<SettingsScreen />);
    expect(getByTestId('settings-cellular-tunnel-banner')).toBeTruthy();
    expect(getByTestId('settings-tunnel-wizard-title').props.children).toBe(
      'Cellular — tunnel required',
    );
    expect(getByText(/Tailscale MagicDNS/)).toBeTruthy();
    expect(getByTestId('settings-tunnel-example-url').props.children).toBe('http://100.x.x.x:8642');
    expect(getByTestId('settings-tunnel-field-link')).toBeTruthy();
  });

  it('shows USB host mismatch banner in settings', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        effectiveGatewayUrl: 'http://127.0.0.1:8642',
        settings: {
          ...mockGatewaySettings,
          gatewayUrl: 'http://127.0.0.1:8642',
        },
        health: {
          level: 'green' as const,
          status: 'ok',
          gatewayState: 'running',
          checkedAt: '2026-06-18T12:00:00.000Z',
          hostname: 'Igors-MacBook-Pro.local',
        },
        activeGatewayProfile: {
          id: 'mac_mini',
          label: 'Mac mini',
          gatewayUrl: 'http://192.168.1.50:8642',
          hostname: 'Igors-Mac-mini.local',
          addedAt: '2026-06-18T12:00:00.000Z',
        },
        gatewayProfiles: [
          {
            id: 'mac_mini',
            label: 'Mac mini',
            gatewayUrl: 'http://192.168.1.50:8642',
            hostname: 'Igors-Mac-mini.local',
            addedAt: '2026-06-18T12:00:00.000Z',
          },
          {
            id: 'mac_book',
            label: 'MacBook Pro',
            gatewayUrl: 'http://127.0.0.1:8642',
            hostname: 'Igors-MacBook-Pro.local',
            addedAt: '2026-06-18T12:00:00.000Z',
          },
        ],
      }),
    );

    const { getByTestId } = render(<SettingsScreen />);
    expect(getByTestId('settings-usb-host-mismatch')).toBeTruthy();
  });

  it('shows Tailscale discovery banner when another Mac is reachable', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        tailscaleDiscoveries: [
          {
            gatewayUrl: 'http://100.94.135.78:8642',
            hostname: 'Igors-Mac-mini.local',
            localIp: '192.168.68.56',
            label: 'Igors-Mac-mini',
          },
        ],
      }),
    );

    const { getByTestId } = render(<SettingsScreen />);
    expect(getByTestId('tailscale-discovery-banner')).toBeTruthy();
    expect(getByTestId('tailscale-add-igors-mac-mini')).toBeTruthy();
  });
});
