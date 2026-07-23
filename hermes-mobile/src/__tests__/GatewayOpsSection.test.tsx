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

  it('expands a cron job row to show purpose, last run, and next run', async () => {
    gatewayClient.listJobs.mockResolvedValue([
      {
        id: 'cron-details',
        name: 'daily-hermes-update',
        schedule: '0 3 * * *',
        paused: false,
        prompt: 'Pull latest fleet config and restart the gateway if healthy.',
        last_run: '2026-07-22T09:00:00.000Z',
        next_run: '2026-07-23T09:00:00.000Z',
      },
    ]);

    const { getByTestId, getByText, queryByText } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('job-row-cron-details')).toBeTruthy();
    });

    expect(queryByText(/Pull latest fleet config/)).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('job-row-cron-details'));
    });

    expect(getByText(/Pull latest fleet config/)).toBeTruthy();
    expect(getByText(/Last ran:/)).toBeTruthy();
    expect(getByText(/Next run:/)).toBeTruthy();
  });

  it('expands a cron job row with no gateway details without crashing', async () => {
    gatewayClient.listJobs.mockResolvedValue([
      { id: 'cron-bare', name: 'bare-job', schedule: '0 9 * * 1', paused: true },
    ]);

    const { getByTestId, getByText } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('job-row-cron-bare')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId('job-row-cron-bare'));
    });

    expect(getByText(/Last ran: never yet/)).toBeTruthy();
    expect(getByText(/Next run: paused/)).toBeTruthy();
  });

  it('shows descriptions for known gateway capabilities and expands the full list', async () => {
    gatewayClient.getCapabilities.mockResolvedValue({
      features: {
        chat_completions: true,
        chat_completions_streaming: true,
        responses_api: true,
        responses_streaming: true,
        run_submission: true,
        run_status: true,
        run_events_sse: true,
        run_stop: true,
        an_unknown_future_capability: true,
      },
      default_model: 'qwen3:8b-64k',
    });

    const { getByTestId, getByText, queryByText } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByText('9 capabilities active on this gateway')).toBeTruthy();
    });

    expect(getByText(/Start a new agent run from the phone\./)).toBeTruthy();
    expect(queryByText(/an unknown future capability/)).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('features-expand-toggle'));
    });

    expect(getByText(/an unknown future capability/)).toBeTruthy();
  });
});
