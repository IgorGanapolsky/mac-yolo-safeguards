import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
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

  it('injects smoke approval for Leash E2E', () => {
    const injectSmokeApproval = jest.fn();
    useGateway.mockReturnValue(mockUseGateway({ injectSmokeApproval }));

    const { getByTestId } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    fireEvent.press(getByTestId('leash-smoke-test'));
    expect(injectSmokeApproval).toHaveBeenCalledTimes(1);
  });

  it('shows leash memory and display toggles when unlocked', () => {
    const { getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByText('Thumbs down → remember block')).toBeTruthy();
    expect(getByText('Glanceable approvals')).toBeTruthy();
  });

  it('refreshes from header button, bottom button, and pull-to-refresh', async () => {
    const refreshHealth = jest.fn().mockResolvedValue(undefined);
    const connectEvents = jest.fn();
    useGateway.mockReturnValue(mockUseGateway({ refreshHealth, connectEvents }));

    const { getByTestId, UNSAFE_getByType } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    
    fireEvent.press(getByTestId('leash-header-refresh'));
    await waitFor(() => {
      expect(refreshHealth).toHaveBeenCalledTimes(1);
      expect(connectEvents).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(getByTestId('leash-refresh-status'));
    await waitFor(() => {
      expect(refreshHealth).toHaveBeenCalledTimes(2);
      expect(connectEvents).toHaveBeenCalledTimes(2);
    });

    const scrollView = UNSAFE_getByType(require('react-native').ScrollView);
    const refreshControl = scrollView.props.refreshControl;

    await act(async () => {
      await refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(refreshHealth).toHaveBeenCalledTimes(3);
      expect(connectEvents).toHaveBeenCalledTimes(3);
    });
  });
});
