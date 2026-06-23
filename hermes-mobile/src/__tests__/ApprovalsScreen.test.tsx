import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import { mockGatewaySettings, mockPendingApproval, mockUseGateway } from '../testUtils/gatewayFixtures';
import { renderInTabNavigator } from '../testUtils/navigation';

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

const { useGateway } = jest.requireMock('../context/GatewayContext');

describe('ApprovalsScreen', () => {
  beforeEach(() => {
    useGateway.mockReturnValue(mockUseGateway());
  });

  it('renders thumbgate leash header and connection block', () => {
    const { getByTestId, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByTestId('THUMBGATE_LEASH')).toBeTruthy();
    expect(getByText('Approve blocked agent tools from your phone')).toBeTruthy();
  });

  it('shows paywall when ThumbGate Leash is not unlocked', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: { ...mockGatewaySettings, thumbgateProActive: false },
      }),
    );
    const { getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByText('ThumbGate Leash is a Pro feature')).toBeTruthy();
  });

  it('shows empty state when no pending approvals', () => {
    const { getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByText('No pending approvals')).toBeTruthy();
  });

  it('renders approval card and resolves via thumbs up', () => {
    const submitApprovalChoice = jest.fn();
    useGateway.mockReturnValue(
      mockUseGateway({
        pendingApprovals: [mockPendingApproval],
        submitApprovalChoice,
      }),
    );

    const { getByTestId, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByText('run_command')).toBeTruthy();
    expect(getByText('rm -rf /tmp/hermes-test')).toBeTruthy();

    fireEvent.press(getByTestId('leash-thumbs-up'));
    expect(submitApprovalChoice).toHaveBeenCalledWith(
      mockPendingApproval.actionId,
      'once',
      mockPendingApproval,
    );
  });

  it('refreshes on pull-to-refresh', async () => {
    const refreshHealth = jest.fn().mockResolvedValue(undefined);
    const connectEvents = jest.fn();
    useGateway.mockReturnValue(mockUseGateway({ refreshHealth, connectEvents }));

    const { UNSAFE_getByType } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    const scrollView = UNSAFE_getByType(require('react-native').ScrollView);
    const refreshControl = scrollView.props.refreshControl;

    await refreshControl.props.onRefresh();

    expect(refreshHealth).toHaveBeenCalled();
    expect(connectEvents).toHaveBeenCalled();
  });
});
