import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import GatewayOpsSection from '../components/GatewayOpsSection';
import SettingsScreen from '../screens/SettingsScreen';
import { mockUseGateway } from '../testUtils/gatewayFixtures';
import { SETTINGS_SECTIONS_EXPANDED_KEY } from '../utils/settingsSectionCollapse';

jest.mock('../context/GatewayContext', () => ({
  useGateway: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void) => {
      React.useEffect(() => {
        callback();
      }, [callback]);
    },
    useNavigation: () => ({ navigate: jest.fn() }),
  };
});

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
    resolveApiKeyForProfile: jest.fn().mockResolvedValue('sk-test-key'),
  },
}));

jest.mock('../services/approvalNotifications', () => ({
  requestHermesNotificationPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('../services/hermesGatewayClient', () => ({
  getCapabilities: jest.fn(),
  listSkills: jest.fn(),
  listJobs: jest.fn(),
  listToolsets: jest.fn(),
  pauseJob: jest.fn(),
  resumeJob: jest.fn(),
  runJobNow: jest.fn(),
  deleteJob: jest.fn(),
  setToolsetEnabled: jest.fn(),
  probeToolsetsWriteAccess: jest.fn(),
  getToolsetConfig: jest.fn(),
  saveToolsetEnv: jest.fn(),
  setToolsetProvider: jest.fn(),
  extractCapabilitiesModel: jest.fn(() => null),
}));

const { useGateway } = jest.requireMock('../context/GatewayContext');
const gatewayClient = jest.requireMock('../services/hermesGatewayClient');

const MINI_PROFILE = {
  id: 'mac_mini_ts',
  label: 'Igors-Mac-mini',
  gatewayUrl: 'http://100.94.135.78:8642',
  hostname: 'Igors-Mac-mini',
  localIp: '100.94.135.78',
  addedAt: '2026-07-15T19:01:00Z',
};

function onTheMini(overrides: Record<string, unknown> = {}) {
  return mockUseGateway({
    activeGatewayProfile: MINI_PROFILE,
    gatewayProfiles: [MINI_PROFILE],
    effectiveGatewayUrl: MINI_PROFILE.gatewayUrl,
    health: {
      level: 'green' as const,
      status: 'ok',
      gatewayState: 'running',
      checkedAt: '2026-07-25T12:00:00.000Z',
      hostname: 'Igors-Mac-mini.local',
      localIp: '100.94.135.78',
    },
    ...overrides,
  });
}

describe('Settings ops catalogs name their machine', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useGateway.mockReturnValue(onTheMini());
    gatewayClient.getCapabilities.mockResolvedValue({ features: {}, default_model: null });
    gatewayClient.listSkills.mockResolvedValue([]);
    gatewayClient.listJobs.mockResolvedValue([]);
    gatewayClient.listToolsets.mockResolvedValue([]);
    gatewayClient.probeToolsetsWriteAccess.mockResolvedValue(false);
  });

  it('puts the active computer in the Cron jobs header so two Macs are never confused', async () => {
    gatewayClient.listJobs.mockResolvedValue([
      { id: 'j1', name: 'nightly-sweep', schedule: '0 9 * * *' },
      { id: 'j2', name: 'weekly-audit', schedule: '0 9 * * 1' },
    ]);

    const { getByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('ops-section-jobs').props.accessibilityLabel).toBe(
        'Expand Cron jobs on Igors-Mac-mini (2)',
      );
    });
  });

  it('puts the active computer in the Skills header too', async () => {
    gatewayClient.listSkills.mockResolvedValue([{ name: 'mac-freeze-rescue' }]);

    const { getByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('ops-section-skills').props.accessibilityLabel).toBe(
        'Expand Skills on Igors-Mac-mini (1)',
      );
    });
  });

  it('falls back to an unscoped header when no computer is connected', async () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        activeGatewayProfile: null,
        gatewayProfiles: [],
        effectiveGatewayUrl: '',
        settings: { ...mockUseGateway().settings, gatewayUrl: '' },
        health: null,
      }),
    );

    const { getByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('ops-section-jobs').props.accessibilityLabel).toBe(
        'Expand Cron jobs (0)',
      );
    });
  });
});

describe('Settings ops catalogs are alphabetical', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useGateway.mockReturnValue(onTheMini());
    gatewayClient.getCapabilities.mockResolvedValue({ features: {}, default_model: null });
    gatewayClient.listSkills.mockResolvedValue([]);
    gatewayClient.listJobs.mockResolvedValue([]);
    gatewayClient.listToolsets.mockResolvedValue([]);
    gatewayClient.probeToolsetsWriteAccess.mockResolvedValue(false);
  });

  it('renders skills A→Z regardless of the category-first order the gateway returns', async () => {
    gatewayClient.listSkills.mockResolvedValue([
      { name: 'zebra-skill' },
      { name: 'Apple-notes', category: 'apple' },
      { name: 'mac-freeze-rescue' },
    ]);

    const { getByTestId, getAllByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('ops-section-skills')).toBeTruthy();
    });
    fireEvent.press(getByTestId('ops-section-skills'));
    // Summary first — full registry is advanced.
    await waitFor(() => {
      expect(getByTestId('skills-summary-card')).toBeTruthy();
    });
    fireEvent.press(getByTestId('skills-list-toggle'));

    await waitFor(() => {
      expect(getAllByTestId(/^skill-expand-/).map((node) => node.props.testID)).toEqual([
        'skill-expand-Apple-notes',
        'skill-expand-mac-freeze-rescue',
        'skill-expand-zebra-skill',
      ]);
    });
  });

  it('renders cron jobs A→Z (the gateway returns creation order)', async () => {
    gatewayClient.listJobs.mockResolvedValue([
      { id: 'j1', name: 'reddit-inbox-monitor', schedule: '0 9 * * *' },
      { id: 'j2', name: 'Daily revenue sweep', schedule: '0 9 * * *' },
      { id: 'j3', name: 'liposhield-price-sync', schedule: '0 9 * * *' },
    ]);

    const { getByTestId, getAllByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('ops-section-jobs')).toBeTruthy();
    });
    fireEvent.press(getByTestId('ops-section-jobs'));

    await waitFor(() => {
      expect(getAllByTestId(/^job-row-/).map((node) => node.props.testID)).toEqual([
        'job-row-j2',
        'job-row-j3',
        'job-row-j1',
      ]);
    });
  });
});

describe('Skills are honestly read-only', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useGateway.mockReturnValue(onTheMini());
    gatewayClient.getCapabilities.mockResolvedValue({ features: {}, default_model: null });
    gatewayClient.listSkills.mockResolvedValue([{ name: 'mac-freeze-rescue' }]);
    gatewayClient.listJobs.mockResolvedValue([]);
    gatewayClient.listToolsets.mockResolvedValue([]);
    gatewayClient.probeToolsetsWriteAccess.mockResolvedValue(false);
  });

  it('explains where skills live and why the phone cannot edit them', async () => {
    const { getByTestId, getByText, getAllByText } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('ops-section-skills')).toBeTruthy();
    });
    fireEvent.press(getByTestId('ops-section-skills'));

    await waitFor(() => {
      expect(getByText(/Read-only here/)).toBeTruthy();
    });
    expect(getByText(/cannot edit or delete them/)).toBeTruthy();
    expect(getAllByText(/Igors-Mac-mini/).length).toBeGreaterThan(0);
    expect(getByTestId('skills-summary-card')).toBeTruthy();

    fireEvent.press(getByTestId('skills-list-toggle'));
    await waitFor(() => {
      expect(getByTestId('skill-expand-mac-freeze-rescue')).toBeTruthy();
    });
    fireEvent.press(getByTestId('skill-expand-mac-freeze-rescue'));
    await waitFor(() => {
      expect(getByTestId('skill-location-mac-freeze-rescue').props.children).toEqual(
        expect.arrayContaining(['Igors-Mac-mini']),
      );
    });
  });
});

describe('Settings sections collapse and remember', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useGateway.mockReturnValue(onTheMini());
    gatewayClient.getCapabilities.mockResolvedValue({ features: {}, default_model: null });
    gatewayClient.listSkills.mockResolvedValue([]);
    gatewayClient.listJobs.mockResolvedValue([]);
    gatewayClient.listToolsets.mockResolvedValue([]);
    gatewayClient.probeToolsetsWriteAccess.mockResolvedValue(false);
  });

  it('gives every major Settings card an accessible expand/collapse button', () => {
    const { getByTestId } = render(<SettingsScreen />);
    for (const id of [
      'settings-section-privacy',
      'settings-section-machines',
      'settings-section-gateway-ops',
      'settings-section-computer-connection',
      'settings-section-notifications',
      'settings-section-safeguards',
    ]) {
      const header = getByTestId(id);
      expect(header.props.accessibilityRole).toBe('button');
      expect(header.props.accessibilityState).toEqual(
        expect.objectContaining({ expanded: expect.any(Boolean) }),
      );
    }
  });

  it('hides a collapsed card body and reveals it on tap', async () => {
    const { getByTestId, queryByTestId } = render(<SettingsScreen />);

    // Notification preferences start collapsed — the switches are not mounted.
    expect(queryByTestId('notification-approvals-switch')).toBeNull();
    expect(getByTestId('settings-section-notifications').props.accessibilityState.expanded).toBe(
      false,
    );

    fireEvent.press(getByTestId('settings-section-notifications'));

    await waitFor(() => {
      expect(getByTestId('notification-approvals-switch')).toBeTruthy();
    });
  });

  it('keeps the connection card open by default so the active machine is visible at a glance', () => {
    const { getByTestId } = render(<SettingsScreen />);
    expect(getByTestId('settings-section-machines').props.accessibilityState.expanded).toBe(true);
    expect(getByTestId('gateway-url-input')).toBeTruthy();
  });

  it('persists the collapse choice across app launches', async () => {
    const first = render(<SettingsScreen />);
    fireEvent.press(first.getByTestId('settings-section-machines'));

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(SETTINGS_SECTIONS_EXPANDED_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string).machines).toBe(false);
    });
    first.unmount();

    const second = render(<SettingsScreen />);
    await waitFor(() => {
      expect(second.getByTestId('settings-section-machines').props.accessibilityState.expanded).toBe(
        false,
      );
    });
    expect(second.queryByTestId('gateway-url-input')).toBeNull();
  });
});
