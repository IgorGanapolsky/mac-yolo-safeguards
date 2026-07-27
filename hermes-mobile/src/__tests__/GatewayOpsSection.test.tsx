import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import GatewayOpsSection from '../components/GatewayOpsSection';
import { mockUseGateway } from '../testUtils/gatewayFixtures';

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
  };
});

jest.mock('../services/haptics', () => ({
  haptics: {
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
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
  extractCapabilitiesModel: jest.fn((caps: { default_model?: string }) => caps?.default_model ?? null),
}));

jest.mock('../services/appOtaUpdate', () => ({
  isOtaUpdatesEnabled: jest.fn(() => false),
  getOtaDiagnostics: jest.fn(() => ({
    isEnabledFlag: false,
    channel: null,
    runtimeVersion: null,
    updateId: null,
    isEmbeddedLaunch: true,
    isEmergencyLaunch: false,
  })),
  checkForAppUpdate: jest.fn(),
  checkAndApplyAppUpdate: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0' },
  nativeAppVersion: '1.0.0',
}));

const { useGateway } = jest.requireMock('../context/GatewayContext');
const gatewayClient = jest.requireMock('../services/hermesGatewayClient');

describe('GatewayOpsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGateway.mockReturnValue(mockUseGateway());
    gatewayClient.getCapabilities.mockResolvedValue({
      features: { toolsets_write: true },
      default_model: 'qwen3:8b-64k',
    });
    gatewayClient.listSkills.mockResolvedValue([]);
    gatewayClient.listJobs.mockResolvedValue([]);
    gatewayClient.listToolsets.mockResolvedValue([
      {
        name: 'web',
        label: 'Web Search',
        enabled: true,
        configured: true,
        tools: ['web_search', 'web_extract'],
      },
    ]);
    gatewayClient.setToolsetEnabled.mockResolvedValue({
      ok: true,
      name: 'web',
      enabled: false,
    });
    gatewayClient.probeToolsetsWriteAccess.mockResolvedValue(true);
  });

  it('updates toolset switch on first tap (optimistic)', async () => {
    const { getByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('toolset-switch-web')).toBeTruthy();
    });

    fireEvent(getByTestId('toolset-switch-web'), 'valueChange', false);

    await waitFor(() => {
      expect(gatewayClient.setToolsetEnabled).toHaveBeenCalledWith(
        'http://192.168.12.208:8642',
        'web',
        false,
        'sk-test-key',
      );
    });

    expect(getByTestId('toolset-switch-web').props.value).toBe(false);
  });

  it('renders connection health hub and agent dashboard', async () => {
    const { getByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('connection-health-hub')).toBeTruthy();
      expect(getByTestId('agent-dashboard-strip')).toBeTruthy();
    });
  });

  it('keeps successful skills when the toolsets endpoint fails', async () => {
    gatewayClient.listSkills.mockResolvedValue([
      { name: 'mac-freeze-rescue', description: 'Recover a sluggish Mac' },
    ]);
    gatewayClient.listToolsets.mockRejectedValue(new Error('Network request failed'));

    const { getByText, getByTestId, queryByText } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByText('mac-freeze-rescue')).toBeTruthy();
      expect(getByTestId('toolsets-empty-state').props.children).toContain(
        'Tools could not load',
      );
    });
    expect(queryByText('Network request failed')).toBeNull();
  });

  it('automatically enables only essential configured toolsets returned disabled by the gateway', async () => {
    gatewayClient.listToolsets.mockResolvedValue([
      {
        name: 'skills',
        label: 'Skills',
        enabled: false,
        configured: true,
        tools: ['skills_list'],
      },
      {
        name: 'todo',
        label: 'Task Planning',
        enabled: false,
        configured: true,
        tools: ['todo'],
      },
      {
        name: 'spotify',
        label: 'Spotify',
        enabled: false,
        configured: true,
        tools: ['spotify_play'],
      },
      {
        name: 'x_search',
        label: 'X Search',
        enabled: false,
        configured: false,
        tools: ['x_search'],
      },
    ]);
    gatewayClient.setToolsetEnabled.mockImplementation(
      async (_url: string, name: string, enabled: boolean) => ({
        ok: true,
        name,
        enabled,
      }),
    );

    const { getByTestId, queryByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(gatewayClient.setToolsetEnabled).toHaveBeenCalledWith(
        'http://192.168.12.208:8642',
        'skills',
        true,
        'sk-test-key',
      );
      expect(gatewayClient.setToolsetEnabled).toHaveBeenCalledWith(
        'http://192.168.12.208:8642',
        'todo',
        true,
        'sk-test-key',
      );
      expect(gatewayClient.setToolsetEnabled).not.toHaveBeenCalledWith(
        'http://192.168.12.208:8642',
        'spotify',
        true,
        'sk-test-key',
      );
      expect(gatewayClient.setToolsetEnabled).not.toHaveBeenCalledWith(
        'http://192.168.12.208:8642',
        'x_search',
        true,
        'sk-test-key',
      );
      expect(getByTestId('toolset-switch-skills').props.value).toBe(true);
      expect(getByTestId('toolset-switch-todo').props.value).toBe(true);
      expect(queryByTestId('toolset-switch-x_search')).toBeNull();
    });
  });

  it('keeps hobby integrations out of primary Essentials and collapses On your Mac', async () => {
    gatewayClient.listToolsets.mockResolvedValue([
      {
        name: 'session_search',
        label: 'Session Search',
        enabled: true,
        configured: true,
        tools: ['search'],
        description: 'search past conversations',
      },
      {
        name: 'homeassistant',
        label: 'Home Assistant',
        enabled: false,
        configured: false,
        tools: ['hass'],
        description: 'smart home device control',
      },
      {
        name: 'spotify',
        label: 'Spotify',
        enabled: true,
        configured: true,
        tools: ['play'],
        description: 'playback',
      },
      {
        name: 'discord',
        label: 'Discord',
        enabled: true,
        configured: true,
        tools: ['discord'],
      },
    ]);

    const { getByTestId, queryByTestId, getByText } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('toolsets-essentials-title')).toBeTruthy();
      expect(getByTestId('toolset-switch-session_search')).toBeTruthy();
    });

    expect(queryByTestId('toolset-switch-homeassistant')).toBeNull();
    expect(queryByTestId('toolset-add-key-homeassistant')).toBeNull();
    expect(queryByTestId('toolset-switch-spotify')).toBeNull();
    expect(queryByTestId('toolsets-advanced-list')).toBeNull();
    expect(getByText(/On your Mac \(2\)/)).toBeTruthy();

    fireEvent.press(getByTestId('toolsets-advanced-toggle'));

    await waitFor(() => {
      expect(getByTestId('toolsets-advanced-list')).toBeTruthy();
      expect(getByTestId('toolset-switch-spotify')).toBeTruthy();
      expect(getByTestId('toolset-switch-discord')).toBeTruthy();
      expect(queryByTestId('toolset-add-key-spotify')).toBeNull();
    });
  });

  it('keeps configured essential toolsets on while automatic enable writes are pending', async () => {
    gatewayClient.listToolsets.mockResolvedValue([
      {
        name: 'web',
        label: 'Web Search',
        enabled: false,
        configured: true,
        tools: ['web_search'],
      },
      {
        name: 'spotify',
        label: 'Spotify',
        enabled: false,
        configured: true,
        tools: ['spotify_play'],
      },
    ]);
    let resolveAutoEnable:
      | ((value: { ok: boolean; name: string; enabled: boolean }) => void)
      | undefined;
    gatewayClient.setToolsetEnabled.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAutoEnable = resolve;
        }),
    );

    const { getByTestId, queryByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(gatewayClient.setToolsetEnabled).toHaveBeenCalledWith(
        'http://192.168.12.208:8642',
        'web',
        true,
        'sk-test-key',
      );
      expect(gatewayClient.setToolsetEnabled).not.toHaveBeenCalledWith(
        'http://192.168.12.208:8642',
        'spotify',
        true,
        'sk-test-key',
      );
      expect(getByTestId('toolset-switch-web').props.value).toBe(true);
      expect(queryByTestId('toolset-switch-spotify')).toBeNull();
    });

    await act(async () => {
      resolveAutoEnable?.({ ok: true, name: 'web', enabled: true });
    });
  });

  it('hides Keys button for ready essential toolsets that need no API key', async () => {
    gatewayClient.listToolsets.mockResolvedValue([
      {
        name: 'web',
        label: 'Web Search',
        enabled: false,
        configured: true,
        tools: ['web_search'],
      },
      {
        name: 'x_search',
        label: 'X Search',
        enabled: true,
        configured: false,
        tools: ['x_search'],
      },
    ]);
    gatewayClient.getCapabilities.mockResolvedValue({
      features: {},
      default_model: 'qwen3:8b-64k',
    });
    gatewayClient.probeToolsetsWriteAccess.mockResolvedValue(false);

    const { getByTestId, queryByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('toolset-switch-web')).toBeTruthy();
    });

    expect(queryByTestId('toolset-add-key-web')).toBeNull();
    expect(queryByTestId('toolset-add-key-x_search')).toBeNull();
    expect(getByTestId('toolset-switch-web').props.disabled).not.toBe(true);

    fireEvent.press(getByTestId('toolsets-advanced-toggle'));
    await waitFor(() => {
      expect(getByTestId('toolset-add-key-x_search')).toBeTruthy();
    });
  });

  it('opens Add key sheet from On your Mac for non-hobby tools that need credentials', async () => {
    gatewayClient.listToolsets.mockResolvedValue([
      {
        name: 'web',
        label: 'Web Search',
        enabled: true,
        configured: true,
        tools: ['web_search'],
      },
      {
        name: 'x_search',
        label: 'X Search',
        enabled: true,
        configured: false,
        tools: ['x_search'],
      },
    ]);

    const { getByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('toolsets-advanced-toggle')).toBeTruthy();
    });
    fireEvent.press(getByTestId('toolsets-advanced-toggle'));

    await waitFor(() => {
      expect(getByTestId('toolset-add-key-x_search')).toBeTruthy();
    });

    fireEvent.press(getByTestId('toolset-add-key-x_search'));

    await waitFor(() => {
      expect(getByTestId('integrations-sheet')).toBeTruthy();
      expect(getByTestId('integrations-sheet-title')).toBeTruthy();
    });
  });

  it('shows delete for long cron job names (actions not clipped off-screen)', async () => {
    gatewayClient.listJobs.mockResolvedValue([
      {
        id: 'cron-long-name',
        name: 'Operate as the daily skool_top1percent revenue workflow operator',
        schedule: '0 9 * * *',
        paused: false,
      },
    ]);

    const { getByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('job-delete-cron-long-name')).toBeTruthy();
    });
  });

  it('expands gateway feature details for known capabilities', async () => {
    gatewayClient.getCapabilities.mockResolvedValue({
      features: {
        chat_completions: true,
        run_stop: true,
        toolsets_write: true,
      },
      default_model: 'qwen3:8b-64k',
    });

    const { getByTestId, getByText, queryByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('feature-expand-chat_completions')).toBeTruthy();
    });
    expect(queryByTestId('feature-details-chat_completions')).toBeNull();

    fireEvent.press(getByTestId('feature-expand-chat_completions'));

    await waitFor(() => {
      expect(getByTestId('feature-details-chat_completions')).toBeTruthy();
      expect(getByText(/multi-turn messages/i)).toBeTruthy();
      expect(getByText('API flag')).toBeTruthy();
    });
    // Protocol capabilities are not fake-toggleable from the phone.
    expect(getByTestId('feature-switch-chat_completions').props.disabled).toBe(true);
  });

  it('expands cron job details for purpose, started, and last run', async () => {
    gatewayClient.listJobs.mockResolvedValue([
      {
        id: 'job-detail-1',
        name: 'Pipeline Dashboard Refresh',
        schedule: { kind: 'interval', minutes: 120, display: 'every 120m' },
        prompt: 'Refresh the revenue pipeline dashboard from metrics.db.',
        created_at: '2026-06-15T17:39:53.520Z',
        last_run_at: '2026-07-23T13:07:35.770Z',
        next_run_at: '2026-07-23T15:07:35.770Z',
        last_status: 'ok',
        paused: false,
      },
    ]);

    const { getByTestId, getByText, queryByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('job-expand-job-detail-1')).toBeTruthy();
    });
    expect(queryByTestId('job-details-job-detail-1')).toBeNull();

    fireEvent.press(getByTestId('job-expand-job-detail-1'));

    await waitFor(() => {
      expect(getByTestId('job-details-job-detail-1')).toBeTruthy();
      expect(getByText('Purpose')).toBeTruthy();
      expect(getByText(/revenue pipeline dashboard/i)).toBeTruthy();
      expect(getByText('Started')).toBeTruthy();
      expect(getByText('Last run')).toBeTruthy();
      expect(getByText('Next run')).toBeTruthy();
    });

    fireEvent.press(getByTestId('job-expand-job-detail-1'));
    await waitFor(() => {
      expect(queryByTestId('job-details-job-detail-1')).toBeNull();
    });
  });

  it('shows Resume when job is paused via enabled:false (not only paused:true)', async () => {
    gatewayClient.listJobs.mockResolvedValue([
      {
        id: 'job-disabled-1',
        name: 'Disabled job',
        schedule: '0 9 * * *',
        enabled: false,
        paused: false,
      },
    ]);

    const { getByTestId, queryByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('job-resume-job-disabled-1')).toBeTruthy();
    });
    expect(queryByTestId('job-pause-job-disabled-1')).toBeNull();
  });
});
