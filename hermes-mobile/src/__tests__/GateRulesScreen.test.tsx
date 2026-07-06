import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import GateRulesScreen from '../screens/GateRulesScreen';
import { mockGatewaySettings, mockUseGateway } from '../testUtils/gatewayFixtures';

jest.mock('../context/GatewayContext', () => ({
  useGateway: jest.fn(),
}));

jest.mock('../services/gateRulesClient', () => ({
  listGateRules: jest.fn(() =>
    Promise.resolve({
      rules: [{ id: 'rule-1', pattern: 'npm test', decision: 'allow' }],
      endpoint: 'http://127.0.0.1:8642/v1/gates',
    }),
  ),
  updateGateRuleDecision: jest.fn(() => Promise.resolve()),
  deleteGateRule: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/thumbgateIap', () => ({
  THUMBGATE_LEASH_IAP_PRODUCT_ID: 'thumbgate_leash_monthly',
  purchaseThumbgateLeash: jest.fn(() => Promise.resolve({ status: 'purchased' })),
  restoreThumbgateLeashPurchases: jest.fn(() => Promise.resolve({ status: 'error', message: 'none' })),
  thumbgateIapSubscribeLabel: jest.fn(() => 'Start Pro - $19/mo'),
}));

const { useGateway } = jest.requireMock('../context/GatewayContext');

describe('GateRulesScreen', () => {
  beforeEach(() => {
    useGateway.mockReturnValue(mockUseGateway());
  });

  it('shows Pro upsell for free users', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: { ...mockGatewaySettings, thumbgateProActive: false, developerLeashUnlock: false },
      }),
    );
    const { getByTestId } = render(<GateRulesScreen visible onClose={jest.fn()} />);
    expect(getByTestId('gate-rules-pro-upsell')).toBeTruthy();
  });

  it('lists rules for Pro users', async () => {
    const { getByTestId } = render(<GateRulesScreen visible onClose={jest.fn()} />);
    await waitFor(() => {
      expect(getByTestId('gate-rule-rule-1')).toBeTruthy();
    });
  });

  it('closes when Done is pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(<GateRulesScreen visible onClose={onClose} />);
    fireEvent.press(getByTestId('gate-rules-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
