import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import IntegrationsSheet from '../components/IntegrationsSheet';

jest.mock('../services/haptics', () => ({
  haptics: {
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

jest.mock('../services/hermesGatewayClient', () => ({
  HermesGatewayApiError: class HermesGatewayApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  getToolsetConfig: jest.fn(),
  saveToolsetEnv: jest.fn(),
  setToolsetEnabled: jest.fn(),
  setToolsetProvider: jest.fn(),
}));

const gatewayClient = jest.requireMock('../services/hermesGatewayClient');

describe('IntegrationsSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    gatewayClient.getToolsetConfig.mockResolvedValue({
      name: 'x_search',
      has_category: true,
      providers: [
        {
          name: 'xAI API key',
          tag: 'Direct xAI API billing via XAI_API_KEY',
          env_vars: [
            {
              key: 'XAI_API_KEY',
              prompt: 'xAI API key',
              url: 'https://console.x.ai/',
              is_set: false,
            },
          ],
          is_active: true,
        },
      ],
    });
    gatewayClient.saveToolsetEnv.mockResolvedValue({
      ok: true,
      name: 'x_search',
      saved: ['XAI_API_KEY'],
      is_set: { XAI_API_KEY: true },
    });
    gatewayClient.setToolsetEnabled.mockResolvedValue({
      ok: true,
      name: 'x_search',
      enabled: true,
    });
  });

  it('loads config and saves the pasted key', async () => {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <IntegrationsSheet
        visible
        toolset={{ name: 'x_search', label: '🐦 X Search', configured: false }}
        gatewayUrl="http://192.168.1.10:8642"
        apiKey="sk-test"
        integrationsConfigAvailable
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    await waitFor(() => {
      expect(getByTestId('integrations-env-XAI_API_KEY')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('integrations-env-XAI_API_KEY'), 'xai-test-key');
    fireEvent.press(getByTestId('integrations-save'));

    await waitFor(() => {
      expect(gatewayClient.saveToolsetEnv).toHaveBeenCalledWith(
        'http://192.168.1.10:8642',
        'x_search',
        { XAI_API_KEY: 'xai-test-key' },
        'sk-test',
      );
      expect(gatewayClient.setToolsetEnabled).toHaveBeenCalledWith(
        'http://192.168.1.10:8642',
        'x_search',
        true,
        'sk-test',
      );
      expect(onSaved).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('falls back to known env fields when integrations_config is unavailable', async () => {
    const { getByTestId } = render(
      <IntegrationsSheet
        visible
        toolset={{ name: 'image_gen', label: 'Image Generation', configured: false }}
        gatewayUrl="http://192.168.1.10:8642"
        apiKey="sk-test"
        integrationsConfigAvailable={false}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(getByTestId('integrations-env-FAL_KEY')).toBeTruthy();
    });
    expect(gatewayClient.getToolsetConfig).not.toHaveBeenCalled();
  });
});
