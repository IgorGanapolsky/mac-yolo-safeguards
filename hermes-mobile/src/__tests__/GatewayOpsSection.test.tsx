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
}));

const { useGateway } = jest.requireMock('../context/GatewayContext');
const gatewayClient = jest.requireMock('../services/hermesGatewayClient');

describe('GatewayOpsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGateway.mockReturnValue(mockUseGateway());
    gatewayClient.getCapabilities.mockResolvedValue({
      features: { toolsets_write: true },
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
});
