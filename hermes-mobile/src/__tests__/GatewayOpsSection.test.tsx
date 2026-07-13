import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
  getToolsetConfig: jest.fn(),
  saveToolsetEnv: jest.fn(),
  setToolsetProvider: jest.fn(),
  extractCapabilitiesModel: jest.fn((caps: { default_model?: string }) => caps?.default_model ?? null),
}));

jest.mock('../services/appOtaUpdate', () => ({
  isOtaUpdatesEnabled: jest.fn(() => false),
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

  it('automatically enables configured toolsets returned disabled by the gateway', async () => {
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

    const { getByTestId } = render(<GatewayOpsSection />);

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
        'x_search',
        true,
        'sk-test-key',
      );
      expect(getByTestId('toolset-switch-skills').props.value).toBe(true);
      expect(getByTestId('toolset-switch-todo').props.value).toBe(true);
      expect(getByTestId('toolset-switch-x_search').props.value).toBe(false);
    });
  });

  it('opens Add key sheet when enabling a tool that still needs credentials', async () => {
    gatewayClient.listToolsets.mockResolvedValue([
      {
        name: 'x_search',
        label: 'X Search',
        enabled: false,
        configured: false,
        tools: ['x_search'],
      },
    ]);

    const { getByTestId } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('toolset-add-key-x_search')).toBeTruthy();
    });

    fireEvent.press(getByTestId('toolset-add-key-x_search'));

    await waitFor(() => {
      expect(getByTestId('integrations-sheet')).toBeTruthy();
      expect(getByTestId('integrations-sheet-title')).toBeTruthy();
    });
  });

  it('shows policy hint for Mac-disabled browser without claiming Update Hermes', async () => {
    gatewayClient.getCapabilities.mockResolvedValue({
      features: { toolsets_write: true },
      default_model: 'qwen3:8b-64k',
    });
    gatewayClient.listToolsets.mockResolvedValue([
      {
        name: 'browser',
        label: 'Browser Automation',
        enabled: false,
        configured: true,
        disabled_by_policy: true,
        disabled_reason: 'Chrome CDP is down on this computer.',
        tools: ['browser_navigate'],
      },
    ]);

    const { getByTestId, queryByText } = render(<GatewayOpsSection />);

    await waitFor(() => {
      expect(getByTestId('toolset-policy-browser')).toBeTruthy();
      expect(getByTestId('toolset-switch-browser').props.disabled).toBe(false);
    });
    expect(queryByText(/Update Hermes on your Mac/i)).toBeNull();
    expect(getByTestId('toolset-policy-browser').props.children).toContain('Chrome CDP');
  });
});
