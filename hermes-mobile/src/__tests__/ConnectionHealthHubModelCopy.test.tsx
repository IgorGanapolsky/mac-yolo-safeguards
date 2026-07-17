import React from 'react';
import { render } from '@testing-library/react-native';
import ConnectionHealthHub from '../components/ConnectionHealthHub';

jest.mock('../services/haptics', () => ({
  haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() },
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

describe('ConnectionHealthHub model copy', () => {
  const baseProps = {
    connectionState: 'connected' as const,
    onRepairConnection: jest.fn().mockResolvedValue(undefined),
  };

  it('shows the actual model without redundant routing copy', () => {
    const { getByTestId, queryByText } = render(
      <ConnectionHealthHub {...baseProps} gatewayModelLabel="grok-4.5" />,
    );

    expect(getByTestId('connection-health-model').props.children.join('')).toBe(
      'Model: grok-4.5',
    );
    expect(queryByText(/Routed model/i)).toBeNull();
  });

  it('omits the model line when the gateway has no real model id', () => {
    const { queryByTestId } = render(<ConnectionHealthHub {...baseProps} />);

    expect(queryByTestId('connection-health-model')).toBeNull();
  });
});
