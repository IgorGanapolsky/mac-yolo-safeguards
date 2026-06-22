import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../screens/SettingsScreen';
import { mockUseGateway } from '../testUtils/gatewayFixtures';

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

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => callback(), [callback]);
    },
  };
});

const { useGateway } = jest.requireMock('../context/GatewayContext');

describe('SettingsScreen', () => {
  beforeEach(() => {
    useGateway.mockReturnValue(mockUseGateway());
  });

  it('renders settings header and gateway inputs', async () => {
    const { getByTestId, getByText } = render(<SettingsScreen />);
    expect(getByTestId('SETTINGS')).toBeTruthy();
    expect(getByText('Gateway tunnel for Chat + optional approval relay for Leash')).toBeTruthy();
    expect(getByTestId('gateway-url-input')).toBeTruthy();
    expect(getByTestId('gateway-api-key-input')).toBeTruthy();
  });

  it('saves configuration', async () => {
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    useGateway.mockReturnValue(mockUseGateway({ saveSettings }));

    const { getByTestId } = render(<SettingsScreen />);
    fireEvent.changeText(getByTestId('gateway-url-input'), 'http://192.168.12.208:8642');
    fireEvent.changeText(getByTestId('gateway-api-key-input'), 'sk-new-key');
    fireEvent.press(getByTestId('save-settings-button'));

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalled();
    });
  });

  it('injects smoke approval for Leash E2E', () => {
    const injectSmokeApproval = jest.fn();
    useGateway.mockReturnValue(mockUseGateway({ injectSmokeApproval }));

    const { getByTestId } = render(<SettingsScreen />);
    fireEvent.press(getByTestId('leash-smoke-test'));
    expect(injectSmokeApproval).toHaveBeenCalledTimes(1);
  });

  it('toggles thumbgate capture switches', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Thumbs down → remember block')).toBeTruthy();
    expect(getByText('Thumbs up → record approval')).toBeTruthy();
  });
});
