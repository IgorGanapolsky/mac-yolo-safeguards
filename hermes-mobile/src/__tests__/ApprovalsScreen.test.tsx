import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import { mockGatewaySettings, mockPendingApproval, mockUseGateway } from '../testUtils/gatewayFixtures';
import { renderInTabNavigator } from '../testUtils/navigation';
import {
  __resetFreeLeashAllowanceForTests,
  consumeFreeLeashApproval,
  refreshFreeLeashWeeklyState,
} from '../utils/freeLeashAllowance';
import { FREE_LEASH_APPROVALS_PER_WEEK } from '../constants/monetization';

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
    __resetFreeLeashAllowanceForTests();
    useGateway.mockReturnValue(mockUseGateway());
  });

  it('renders thumbgate leash header and connection block', () => {
    const { getByTestId, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByTestId('THUMBGATE_LEASH')).toBeTruthy();
    expect(getByText('Approve blocked tools from your phone — tap notifications on lock screen')).toBeTruthy();
  });

  it('shows paywall when ThumbGate Leash is not unlocked', async () => {
    await refreshFreeLeashWeeklyState();
    for (let i = 0; i < FREE_LEASH_APPROVALS_PER_WEEK; i += 1) {
      await consumeFreeLeashApproval();
    }
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
    expect(getByText('Quick-approve layout')).toBeTruthy();
    expect(
      getByText(
        'One approval at a time with bigger buttons. Hides diffs and thumbs. Announces connection status with VoiceOver. This only changes the Leash screen — not push alerts (see Settings → Smart notifications).',
      ),
    ).toBeTruthy();
  });

  it('mentions lock screen in hero subtitle when quick-approve layout is on', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: { ...mockGatewaySettings, glanceMode: true },
      }),
    );
    const { getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(
      getByText('Approve blocked agent tools — from lock screen (Approve / Deny) or cards below'),
    ).toBeTruthy();
  });

  it('mentions lock screen in hero subtitle when approval-first mode is on', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: { ...mockGatewaySettings, safetyMode: true },
      }),
    );
    const { getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(
      getByText('Approve blocked agent tools — from lock screen (Approve / Deny) or cards below'),
    ).toBeTruthy();
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

  it('clears the pull-to-refresh spinner after a successful refresh', async () => {
    useGateway.mockReturnValue(
      mockUseGateway({ refreshHealth: jest.fn().mockResolvedValue(undefined) }),
    );

    const { UNSAFE_getByType } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    const scrollView = UNSAFE_getByType(require('react-native').ScrollView);

    expect(scrollView.props.refreshControl.props.refreshing).toBe(false);

    await act(async () => {
      await scrollView.props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(
        UNSAFE_getByType(require('react-native').ScrollView).props.refreshControl.props.refreshing,
      ).toBe(false);
    });
  });

  it('clears the pull-to-refresh spinner even when the refresh throws', async () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        refreshHealth: jest.fn().mockRejectedValue(new Error('gateway unreachable')),
      }),
    );

    const { UNSAFE_getByType } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    const scrollView = UNSAFE_getByType(require('react-native').ScrollView);

    await act(async () => {
      await scrollView.props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(
        UNSAFE_getByType(require('react-native').ScrollView).props.refreshControl.props.refreshing,
      ).toBe(false);
    });
  });

  it('does not spin the pull-to-refresh control for a background focus refresh', async () => {
    let resolveHealth: (() => void) | undefined;
    const refreshHealth = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHealth = resolve;
        }),
    );
    useGateway.mockReturnValue(
      mockUseGateway({ connectionState: 'disconnected', refreshHealth }),
    );

    const { UNSAFE_getByType } = renderInTabNavigator(ApprovalsScreen, 'Leash');

    await waitFor(() => {
      expect(refreshHealth).toHaveBeenCalledTimes(1);
    });

    const scrollView = UNSAFE_getByType(require('react-native').ScrollView);
    expect(scrollView.props.refreshControl.props.refreshing).toBe(false);

    await act(async () => {
      resolveHealth?.();
    });
  });
});
