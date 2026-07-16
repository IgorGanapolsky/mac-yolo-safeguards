import React from 'react';
import { Alert } from 'react-native';
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

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => callback(), [callback]);
    },
    useNavigation: () => ({
      navigate: mockNavigate,
    }),
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
    mockNavigate.mockClear();
  });

  it('renders settings header and gateway inputs', async () => {
    const { getByTestId, getByText } = render(<SettingsScreen />);
    expect(getByTestId('SETTINGS')).toBeTruthy();
    expect(getByText('Pair Hermes Relay, choose active machines, and run local fallback ops')).toBeTruthy();
    expect(getByTestId('GATEWAY_OPS')).toBeTruthy();
    expect(getByTestId('gateway-url-input')).toBeTruthy();
    expect(getByTestId('gateway-api-key-input')).toBeTruthy();
  });

  it('Done returns to Hermes chat (escape hatch when tabs are hard to reach)', () => {
    const { getByTestId } = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-done'));
    expect(mockNavigate).toHaveBeenCalledWith('Chat');
  });

  it('Android hardware back leaves Settings for Chat', () => {
    const { BackHandler, Platform } = require('react-native');
    const originalOS = Platform.OS;
    Platform.OS = 'android';
    const addSpy = jest.spyOn(BackHandler, 'addEventListener');

    render(<SettingsScreen />);
    const handler = addSpy.mock.calls.find(([eventName]) => eventName === 'hardwareBackPress')?.[1] as
      | (() => boolean)
      | undefined;
    expect(handler).toBeTruthy();
    expect(handler?.()).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith('Chat');

    addSpy.mockRestore();
    Platform.OS = originalOS;
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

  it('does not switch to relay mode when pairing fails (P0 2026-07-14 resource_exhausted)', async () => {
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    const completePair = jest.fn().mockRejectedValue(new Error('RELAY failed (resource_exhausted)'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useGateway.mockReturnValue(mockUseGateway({ saveSettings, completePair }));

    const { getByPlaceholderText, getByText } = render(<SettingsScreen />);
    fireEvent.changeText(getByPlaceholderText('MOON-DUST'), 'MOON-DUST');
    fireEvent.press(getByText('PAIR WITH COMPUTER'));

    await waitFor(() => {
      expect(completePair).toHaveBeenCalledWith('MOON-DUST');
    });
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Pairing failed', 'RELAY failed (resource_exhausted)');
    });
    // A failed relay pair must never persist connectionMode: 'relay' — that would silently
    // break an otherwise-healthy USB/Tailscale gateway connection until manually reverted.
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('persists relay mode only after pairing succeeds', async () => {
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    const completePair = jest.fn().mockResolvedValue(undefined);
    useGateway.mockReturnValue(mockUseGateway({ saveSettings, completePair }));

    const { getByPlaceholderText, getByText } = render(<SettingsScreen />);
    fireEvent.changeText(getByPlaceholderText('MOON-DUST'), 'MOON-DUST');
    fireEvent.press(getByText('PAIR WITH COMPUTER'));

    await waitFor(() => {
      expect(completePair).toHaveBeenCalledWith('MOON-DUST');
    });
    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ connectionMode: 'relay' }),
        expect.anything(),
      );
    });
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

  it('clarifies notification preferences do not change Leash layout', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Notification preferences')).toBeTruthy();
    expect(
      getByText(
        'Choose which background alerts Hermes may send. Does not change how Leash looks in the app.',
      ),
    ).toBeTruthy();
  });

  it('renders per-category notification toggles', () => {
    const { getByTestId, getByText } = render(<SettingsScreen />);
    expect(getByText('Approval alerts')).toBeTruthy();
    expect(getByText('Live run status')).toBeTruthy();
    expect(getByText('Completion / failure')).toBeTruthy();
    expect(getByTestId('notification-approvals-switch')).toBeTruthy();
    expect(getByTestId('notification-live-run-switch')).toBeTruthy();
    expect(getByTestId('notification-completion-switch')).toBeTruthy();
  });

  it('saves granular notification preferences', async () => {
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    useGateway.mockReturnValue(mockUseGateway({ saveSettings }));

    const { getByTestId } = render(<SettingsScreen />);
    fireEvent(getByTestId('notification-approvals-switch'), 'valueChange', false);
    fireEvent(getByTestId('notification-live-run-switch'), 'valueChange', true);
    fireEvent(getByTestId('notification-completion-switch'), 'valueChange', false);
    fireEvent.press(getByTestId('save-settings-button'));

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalled();
    });
    expect(saveSettings.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        notificationApprovals: false,
        notificationLiveRunStatus: true,
        notificationCompletion: false,
        notificationsEnabled: true,
      }),
    );
  });
});
