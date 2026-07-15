import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AppUpdatesCard from '../components/AppUpdatesCard';
import { checkAndApplyAppUpdate, getInstalledOtaInfo } from '../services/appOtaUpdate';

jest.mock('../services/haptics', () => ({
  haptics: {
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

jest.mock('../services/appOtaUpdate', () => ({
  isOtaUpdatesEnabled: jest.fn(() => true),
  getInstalledOtaInfo: jest.fn(() => ({
    enabled: true,
    channel: 'production',
    runtimeVersion: '1.0',
    updateId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    isEmbeddedLaunch: false,
    createdAt: '2026-07-15T12:00:00.000Z',
  })),
  checkAndApplyAppUpdate: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0' },
  nativeAppVersion: '1.0',
}));

describe('AppUpdatesCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkAndApplyAppUpdate as jest.Mock).mockResolvedValue({
      status: 'current',
      message:
        'No newer update on channel "production" for runtime 1.0. Running aaaaaaaa… (downloaded OTA).',
    });
  });

  it('renders channel, runtime, and check button at the top-level card', () => {
    const { getByTestId, getByText } = render(<AppUpdatesCard />);
    expect(getByTestId('app-updates-card')).toBeTruthy();
    expect(getByText('App updates')).toBeTruthy();
    expect(getByTestId('app-updates-meta').props.children).toContain('Channel: production');
    expect(getByTestId('app-updates-meta').props.children).toContain('Runtime: 1.0');
    expect(getByTestId('app-updates-check')).toBeTruthy();
    expect(getByText('Check for update')).toBeTruthy();
  });

  it('runs check and shows honest status (not a buried Tools path)', async () => {
    const { getByTestId } = render(<AppUpdatesCard />);
    fireEvent.press(getByTestId('app-updates-check'));
    await waitFor(() => {
      expect(checkAndApplyAppUpdate).toHaveBeenCalled();
      expect(getInstalledOtaInfo).toHaveBeenCalled();
      expect(getByTestId('app-updates-status').props.children).toContain('No newer update');
      expect(getByTestId('app-updates-status').props.children).toContain('production');
    });
  });

  it('surfaces download/restart messaging when an update applies', async () => {
    (checkAndApplyAppUpdate as jest.Mock).mockResolvedValue({
      status: 'available',
      message: 'Restarting now with the downloaded update…',
    });
    const { getByTestId } = render(<AppUpdatesCard />);
    fireEvent.press(getByTestId('app-updates-check'));
    await waitFor(() => {
      expect(getByTestId('app-updates-status').props.children).toContain('Restarting');
    });
  });
});
