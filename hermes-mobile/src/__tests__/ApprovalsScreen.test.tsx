import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import {
  loadLeashDecisionHistory,
  recordLeashDecision,
} from '../services/leashDecisionHistory';
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
  beforeEach(async () => {
    __resetFreeLeashAllowanceForTests();
    useGateway.mockReturnValue(mockUseGateway());
    await AsyncStorage.clear();
  });

  it('renders thumbgate leash header and connection block', () => {
    const { getByTestId, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByTestId('THUMBGATE_LEASH')).toBeTruthy();
    expect(getByText('Approve blocked tools from your phone — tap notifications on lock screen')).toBeTruthy();
  });

  it('keeps header refresh vertically centered beside health pill', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        health: {
          level: 'green',
          gatewayState: 'unpaired',
          directGatewayReachable: true,
          hostname: 'Igors-Mac-mini.local',
        },
        settings: { ...mockGatewaySettings, connectionMode: 'relay' },
      }),
    );

    const { getByTestId, getByText, queryByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByText('Connected')).toBeTruthy();
    expect(getByText('Igors-Mac-mini')).toBeTruthy();
    expect(queryByText(/not paired/i)).toBeNull();
    expect(queryByText(/pair relay/i)).toBeNull();
    expect(getByTestId('leash-header-pill-row')).toBeTruthy();
    expect(getByTestId('leash-header-refresh')).toBeTruthy();
    const refreshStyle = getByTestId('leash-header-refresh').props.style;
    const flat = Array.isArray(refreshStyle) ? Object.assign({}, ...refreshStyle) : refreshStyle;
    expect(flat.alignSelf).toBe('center');
  });

  it('never shows red Not paired when Mac HTTP is already reachable', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        health: {
          level: 'green',
          gatewayState: 'unpaired',
          directGatewayReachable: true,
          hostname: 'Igors-Mac-mini.local',
        },
        isPaired: false,
        lastEventError:
          'Not paired — run desktop bridge pairing and enter the code in Settings.',
        settings: { ...mockGatewaySettings, connectionMode: 'relay' },
      }),
    );

    const { getByText, queryByTestId, queryByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByText('Connected')).toBeTruthy();
    expect(queryByTestId('leash-event-error')).toBeNull();
    expect(queryByText(/Not paired/i)).toBeNull();
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
    const { getByText, getByTestId, queryByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByText('No pending approvals')).toBeTruthy();
    const body = getByTestId('leash-empty-body');
    expect(body.props.children).toContain('your Mac');
    expect(String(body.props.children)).not.toMatch(/config\.yaml|approvals\.mode|git push|rm,/i);
    expect(queryByText(/Tap Refresh above/i)).toBeNull();
    expect(queryByText(/Hermes Mobile connected\. Gateway healthy/i)).toBeNull();
    expect(getByTestId('thumbgate-promo-leash_empty')).toBeTruthy();
  });

  it('shows disconnected Leash promo when not connected to a Mac', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        connectionState: 'disconnected',
      }),
    );
    const { getByTestId } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByTestId('thumbgate-promo-leash_disconnected')).toBeTruthy();
  });

  it('collapses connection prose to one headline line when linked', () => {
    useGateway.mockReturnValue(
      mockUseGateway({
        connectionState: 'connected',
        health: { level: 'green', gatewayState: 'running', hostname: 'Computer via Tailscale' },
        sessionGreeting: 'Hermes Mobile connected. Gateway healthy.',
        settings: { ...mockGatewaySettings, connectionMode: 'gateway' },
        effectiveGatewayUrl: 'http://100.64.0.1:8642',
      }),
    );
    const { getByTestId, queryByText, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByTestId('leash-connection-status')).toBeTruthy();
    expect(getByText(/Direct local link/i)).toBeTruthy();
    expect(queryByText(/^Machine:/)).toBeNull();
    expect(queryByText(/^IP:/)).toBeNull();
    expect(queryByText(/Hermes Mobile connected\. Gateway healthy/i)).toBeNull();
    expect(queryByText(/Tap Refresh above/i)).toBeNull();
  });

  it('shows Pro upsell when free weekly allowance remains but not Pro', async () => {
    await refreshFreeLeashWeeklyState();
    useGateway.mockReturnValue(
      mockUseGateway({
        settings: {
          ...mockGatewaySettings,
          thumbgateProActive: false,
          developerLeashUnlock: false,
        },
      }),
    );
    const { getByTestId, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    expect(getByText('No pending approvals')).toBeTruthy();
    expect(getByTestId('leash-pro-upsell-card')).toBeTruthy();
    expect(getByTestId('pro-upgrade-card')).toBeTruthy();
    // Android: lifetime IAP CTA. iOS: web subscription CTA (no StoreKit subs).
    const iapCta = (() => {
      try {
        return getByTestId('subscribe-thumbgate-leash-iap');
      } catch {
        return null;
      }
    })();
    const webCta = (() => {
      try {
        return getByTestId('open-thumbgate-web-subscription');
      } catch {
        return null;
      }
    })();
    expect(iapCta || webCta).toBeTruthy();
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

  it('shows chat-sourced approvals in the Recent decisions history', async () => {
    await recordLeashDecision({
      actionId: 'chat-nudge-1',
      decision: 'approved',
      title: 'Proceed with these steps',
      source: 'chat',
    });

    const { findByTestId, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');

    await findByTestId('leash-decision-history');
    expect(getByText('Recent decisions')).toBeTruthy();
    expect(getByText('Proceed with these steps')).toBeTruthy();
    expect(getByText(/From Chat/)).toBeTruthy();
    expect(getByText('✓ Approved')).toBeTruthy();
  });

  it('shows denied Leash decisions in history', async () => {
    await recordLeashDecision({
      actionId: 'leash-deny-1',
      decision: 'denied',
      title: 'rm -rf /tmp/x',
      source: 'leash',
    });

    const { findByTestId, getByText } = renderInTabNavigator(ApprovalsScreen, 'Leash');

    await findByTestId('leash-decision-leash-deny-1');
    expect(getByText('✕ Denied')).toBeTruthy();
    expect(getByText(/From Leash/)).toBeTruthy();
  });

  it('records a decision to history when approving from the Leash card', async () => {
    const submitApprovalChoice = jest.fn().mockResolvedValue(undefined);
    useGateway.mockReturnValue(
      mockUseGateway({
        pendingApprovals: [mockPendingApproval],
        submitApprovalChoice,
      }),
    );

    const { getByTestId } = renderInTabNavigator(ApprovalsScreen, 'Leash');
    await act(async () => {
      fireEvent.press(getByTestId('leash-thumbs-up'));
    });

    await waitFor(async () => {
      const history = await loadLeashDecisionHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        actionId: mockPendingApproval.actionId,
        decision: 'approved',
        source: 'leash',
        title: 'Dangerous command execution',
      });
    });
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
