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

  it('renders thumbgate leash header and connection block for Pro users', () => {
    const { getByTestId, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByTestId('THUMBGATE_LEASH')).toBeTruthy();
    expect(getByTestId('leash-title-dev-unlock')).toBeTruthy();
    expect(getByText('Pro approval queue for blocked agent tools')).toBeTruthy();
    expect(getByText('THUMBGATE LEASH')).toBeTruthy();
  });

  it('shows free-tier paywall and upgrade CTA without Pro', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: { ...mockGatewaySettings, thumbgateProActive: false, developerLeashUnlock: false },
      }),
    );
    const { getByTestId, getByText, queryByTestId, queryByText } = renderInTabNavigator(
      ApprovalsScreen,
      'Leash',
    );
    expect(getByTestId('leash-free-tier-paywall')).toBeTruthy();
    expect(getByTestId('leash-paywall-headline')).toHaveTextContent(/firewall/i);
    expect(getByTestId('gate-rules-pro-upsell')).toHaveTextContent(/Hermes chat stays free/);
    expect(queryByTestId('no-pending-approvals')).toBeNull();
    expect(queryByText('No pending approvals')).toBeNull();
    expect(queryByTestId('leash-smoke-test')).toBeNull();
    expect(queryByTestId('unlock-thumbgate-leash')).toBeNull();
  });

  it('shows empty state when Pro user has no pending approvals', () => {
    const { getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByText('No pending approvals')).toBeTruthy();
  });

  it('renders approval card and resolves via thumbs up for Pro users', () => {
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

  it('never renders fake smoke-test approval controls even when Pro is unlocked', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: { ...mockGatewaySettings, developerLeashUnlock: true, thumbgateProActive: true },
      }),
    );

    const { queryByText, queryByTestId, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(queryByTestId('leash-smoke-test')).toBeNull();
    expect(queryByText(/smoke test/i)).toBeNull();
    expect(getByText('Thumbs down → remember block')).toBeTruthy();
  });

  it('shows leash memory and display toggles when Pro is enabled', () => {
    const { getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByText('Thumbs down → remember block')).toBeTruthy();
    expect(getByText('Glanceable approvals')).toBeTruthy();
  });

  it('long-presses title to trigger developer Leash unlock when allowed', () => {
    const activateDeveloperLeashUnlock = jest.fn().mockResolvedValue(undefined);
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: { ...mockGatewaySettings, thumbgateProActive: false },
        activateDeveloperLeashUnlock,
      }),
    );

    const { getByTestId } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    fireEvent(getByTestId('leash-title-dev-unlock'), 'longPress');
    expect(activateDeveloperLeashUnlock).toHaveBeenCalledTimes(1);
  });

  it('keeps the hidden title long-press backdoor without visible free-tier unlock controls', () => {
    const activateDeveloperLeashUnlock = jest.fn().mockResolvedValue(undefined);
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: { ...mockGatewaySettings, thumbgateProActive: false, developerLeashUnlock: false },
        activateDeveloperLeashUnlock,
      }),
    );

    const { getByTestId, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByTestId('leash-free-tier-paywall')).toBeTruthy();
    fireEvent(getByTestId('leash-title-dev-unlock'), 'longPress');
    expect(activateDeveloperLeashUnlock).toHaveBeenCalledTimes(1);
    expect(getByText('THUMBGATE LEASH')).toBeTruthy();
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
