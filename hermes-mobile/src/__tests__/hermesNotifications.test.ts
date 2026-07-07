import {
  approvalNotificationSubtitle,
  parseApprovalNotificationResponse,
  parseHermesNotificationResponse,
  resolveHermesNotificationHandlerResult,
  runProgressNotificationTitle,
  scheduleApprovalsSummaryNotification,
  scheduleRunProgressNotification,
  scheduleRunStallNotification,
  shouldDismissRunNotificationsForAppState,
} from '../services/hermesNotifications';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

describe('hermesNotifications', () => {
  it('parses approve_once notification actions', () => {
    const parsed = parseHermesNotificationResponse({
      actionIdentifier: 'approve_once',
      notification: {
        request: { content: { data: { actionId: 'act-1', runId: 'run-9' } } },
      },
    });
    expect(parsed).toEqual({
      kind: 'approval',
      actionId: 'act-1',
      runId: 'run-9',
      choice: 'once',
    });
  });

  it('parses view_chat as navigation to Chat', () => {
    const parsed = parseHermesNotificationResponse({
      actionIdentifier: 'view_chat',
      notification: { request: { content: { data: { type: 'run_progress' } } } },
    });
    expect(parsed).toEqual({ kind: 'navigate', tab: 'Chat' });
  });

  it('parses default tap on approval with session deep link', () => {
    const parsed = parseHermesNotificationResponse({
      notification: {
        request: {
          content: {
            data: { type: 'approval', sessionId: 'sess-7', actionId: 'act-1' },
          },
        },
      },
    });
    expect(parsed).toEqual({
      kind: 'navigate',
      tab: 'Chat',
      sessionId: 'sess-7',
    });
  });

  it('parses approval_summary default tap to Leash when no session', () => {
    const parsed = parseHermesNotificationResponse({
      notification: {
        request: {
          content: { data: { type: 'approval_summary', count: 3 } },
        },
      },
    });
    expect(parsed).toEqual({ kind: 'navigate', tab: 'Leash' });
  });

  it('keeps parseApprovalNotificationResponse compatibility', () => {
    const parsed = parseApprovalNotificationResponse({
      actionIdentifier: 'deny',
      notification: {
        request: { content: { data: { actionId: 'act-2' } } },
      },
    });
    expect(parsed).toEqual({ actionId: 'act-2', runId: undefined, choice: 'deny' });
  });

  it('formats approval subtitle with risk tier', () => {
    expect(
      approvalNotificationSubtitle({
        actionId: 'a',
        toolName: 'bash',
        reason: 'run script',
        receivedAt: '',
        riskTier: 'high',
      }),
    ).toBe('High risk · bash');
  });

  it('maps run progress phases to notification titles', () => {
    expect(
      runProgressNotificationTitle({
        phase: 'approval',
        startedAtMs: Date.now(),
      }),
    ).toBe('Waiting for your approval');
    expect(
      runProgressNotificationTitle({
        phase: 'streaming',
        startedAtMs: Date.now(),
      }),
    ).toBe('Hermes is responding');
  });

  it('dismisses run notifications when the app is foregrounded', () => {
    expect(shouldDismissRunNotificationsForAppState('active')).toBe(true);
    expect(shouldDismissRunNotificationsForAppState('background')).toBe(false);
    expect(shouldDismissRunNotificationsForAppState('inactive')).toBe(false);
  });

  describe('foreground suppression', () => {
    const originalCurrentState = AppState.currentState;

    afterEach(() => {
      Object.defineProperty(AppState, 'currentState', {
        value: originalCurrentState,
        configurable: true,
      });
      jest.clearAllMocks();
    });

    it('does not schedule run progress notification while app is active', async () => {
      Object.defineProperty(AppState, 'currentState', {
        value: 'active',
        configurable: true,
      });

      await scheduleRunProgressNotification(
        { phase: 'working', startedAtMs: Date.now() },
        { runId: 'run-1', sessionId: 'sess-1' },
      );

      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('does not schedule stall notification while app is active', async () => {
      Object.defineProperty(AppState, 'currentState', {
        value: 'active',
        configurable: true,
      });

      await scheduleRunStallNotification('run-1', 'sess-1');

      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('does not schedule approvals summary while app is active', async () => {
      Object.defineProperty(AppState, 'currentState', {
        value: 'active',
        configurable: true,
      });

      await scheduleApprovalsSummaryNotification(
        [
          {
            actionId: 'act-1',
            toolName: 'bash',
            reason: 'deploy',
            receivedAt: '',
          },
          {
            actionId: 'act-2',
            toolName: 'bash',
            reason: 'rollback',
            receivedAt: '',
          },
        ],
        { badgeCount: 2 },
      );

      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });

  describe('notification handler foreground policy', () => {
    function handlerPresentation(
      appState: string,
      type: string,
      extraData: Record<string, unknown> = {},
    ) {
      return resolveHermesNotificationHandlerResult(
        { request: { content: { data: { type, ...extraData } } } },
        appState,
      );
    }

    it('suppresses banner and sound for every Hermes type while active', () => {
      for (const type of [
        'run_progress',
        'run_stall',
        'run_completed',
        'approval',
        'approval_summary',
      ]) {
        const result = handlerPresentation('active', type, { riskTier: 'high' });
        expect(result).toEqual({
          shouldShowAlert: false,
          shouldShowBanner: false,
          shouldPlaySound: false,
          shouldSetBadge: true,
          shouldShowList: true,
        });
      }
    });

    it('allows banners in background and inactive', () => {
      for (const appState of ['background', 'inactive'] as const) {
        const result = handlerPresentation(appState, 'run_progress');
        expect(result.shouldShowBanner).toBe(true);
        expect(result.shouldShowAlert).toBe(true);
      }
    });

    it('plays approval sounds only when not active', () => {
      const active = handlerPresentation('active', 'approval');
      expect(active.shouldPlaySound).toBe(false);

      const background = handlerPresentation('background', 'approval');
      expect(background.shouldPlaySound).toBe(true);
    });
  });
});
