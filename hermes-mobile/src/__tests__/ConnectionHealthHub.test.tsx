import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ConnectionHealthHub from '../components/ConnectionHealthHub';
import { checkForAppUpdate } from '../services/appOtaUpdate';

jest.mock('../services/haptics', () => ({
  haptics: {
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

jest.mock('../services/appOtaUpdate', () => ({
  isOtaUpdatesEnabled: jest.fn(() => true),
  checkForAppUpdate: jest.fn(),
  checkAndApplyAppUpdate: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.2.3' },
  nativeAppVersion: '1.2.3',
}));

describe('ConnectionHealthHub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkForAppUpdate as jest.Mock).mockResolvedValue({
      status: 'current',
      message: 'App is up to date.',
    });
  });

  it('renders connection label and version', () => {
    const { getByTestId } = render(
      <ConnectionHealthHub
        connectionState="connected"
        health={{ level: 'green', checkedAt: 'x', hostname: 'mini.local' }}
        macHttpReachable
        gatewayModelLabel="qwen3:8b-64k"
        onRepairConnection={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(getByTestId('connection-health-label').props.children).toBe('Computer linked');
    expect(getByTestId('connection-health-version').props.children.join('')).toContain('1.2.3');
    expect(getByTestId('connection-health-model').props.children.join('')).toContain('qwen3:8b-64k');
  });

  it('runs repair callback', async () => {
    const onRepairConnection = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <ConnectionHealthHub
        connectionState="disconnected"
        onRepairConnection={onRepairConnection}
      />,
    );

    fireEvent.press(getByTestId('connection-health-repair'));
    await waitFor(
      () => {
        expect(onRepairConnection).toHaveBeenCalled();
      },
      { timeout: 10000 },
    );
  });

  it('checks for OTA update', async () => {
    const { getByTestId } = render(
      <ConnectionHealthHub
        connectionState="connected"
        onRepairConnection={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.press(getByTestId('connection-health-check-update'));
    await waitFor(() => {
      expect(checkForAppUpdate).toHaveBeenCalled();
      expect(getByTestId('connection-health-update-message').props.children).toBe(
        'App is up to date.',
      );
    });
  });

  it('clears update spinner after timed-out check', async () => {
    (checkForAppUpdate as jest.Mock).mockResolvedValue({
      status: 'error',
      message: 'Update check timed out after 30s',
    });
    const { getByTestId, queryByText } = render(
      <ConnectionHealthHub
        connectionState="connected"
        onRepairConnection={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.press(getByTestId('connection-health-check-update'));
    await waitFor(() => {
      expect(getByTestId('connection-health-update-message').props.children).toBe(
        'Update check timed out after 30s',
      );
      expect(queryByText('Check for update')).toBeTruthy();
    });
  });
});
