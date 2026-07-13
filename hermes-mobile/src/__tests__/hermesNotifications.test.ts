jest.mock('expo', () => ({
  isRunningInExpoGo: () => false,
}));

import {
  clearRunProgressNotification,
  initHermesNotifications,
  approvalNotificationSubtitle,
  parseApprovalNotificationResponse,
  parseHermesNotificationResponse,
  resolveHermesNotificationHandlerResult,
  runProgressNotificationTitle,
  resetApprovalNotificationState,
  scheduleApprovalNotification,
  scheduleApprovalsSummaryNotification,
  scheduleRunCompletedNotification,
  scheduleRunProgressNotification,
  scheduleRunStallNotification,
  setHermesNotificationsModuleForTests,
  shouldDismissRunNotificationsForAppState,
} from '../services/hermesNotifications';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

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

    it('keeps every Hermes notification status-bar-only in background and inactive', () => {
      for (const appState of ['background', 'inactive'] as const) {
        for (const type of [
          'run_progress',
          'run_stall',
          'run_completed',
          'approval',
          'approval_summary',
        ]) {
          const result = handlerPresentation(appState, type);
          expect(result.shouldShowBanner).toBe(false);
          expect(result.shouldShowAlert).toBe(false);
          expect(result.shouldPlaySound).toBe(false);
          expect(result.shouldShowList).toBe(true);
        }
      }
    });

    it('never plays approval sounds', () => {
      expect(handlerPresentation('active', 'approval').shouldPlaySound).toBe(false);
      expect(handlerPresentation('background', 'approval').shouldPlaySound).toBe(false);
    });
  });

  describe('quiet Android channels and run deduplication', () => {
    const originalCurrentState = AppState.currentState;
    const originalPlatform = Platform.OS;

    beforeEach(() => {
      setHermesNotificationsModuleForTests({
        ...Notifications,
        SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
      } as unknown as typeof Notifications);
    });

    afterEach(async () => {
      Object.defineProperty(AppState, 'currentState', {
        value: originalCurrentState,
        configurable: true,
      });
      Object.defineProperty(Platform, 'OS', {
        value: originalPlatform,
        configurable: true,
      });
      await clearRunProgressNotification();
      resetApprovalNotificationState();
      setHermesNotificationsModuleForTests(null);
      jest.clearAllMocks();
    });

    it('creates only versioned low-importance Android channels', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });

      await initHermesNotifications();

      for (const channelId of [
        'hermes-approvals-quiet-v2',
        'hermes-runs-quiet-v2',
        'hermes-results-quiet-v2',
      ]) {
        expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
          channelId,
          expect.objectContaining({ importance: Notifications.AndroidImportance.LOW }),
        );
      }
      expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ importance: Notifications.AndroidImportance.HIGH }),
      );
    });

    it('posts only once for repeated updates in the same run phase', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
      await clearRunProgressNotification();
      jest.clearAllMocks();

      await scheduleRunProgressNotification(
        { phase: 'streaming', startedAtMs: 1, runId: 'run-quiet' },
        { runId: 'run-quiet', force: true },
      );
      await scheduleRunProgressNotification(
        { phase: 'streaming', startedAtMs: 1, runId: 'run-quiet', outputTokens: 200 },
        { runId: 'run-quiet', force: true },
      );

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            channelId: 'hermes-runs-quiet-v2',
            priority: Notifications.AndroidNotificationPriority.LOW,
          }),
        }),
      );

      await scheduleRunProgressNotification(
        { phase: 'approval', startedAtMs: 1, runId: 'run-quiet' },
        { runId: 'run-quiet', force: true },
      );
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    });

    it('keeps approval, summary, completion, and stall payloads quiet', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });

      const approval = {
        actionId: 'quiet-approval',
        toolName: 'bash',
        reason: 'Review command',
        receivedAt: '2026-07-13T14:00:00.000Z',
      };
      await scheduleApprovalNotification(approval, { force: true });
      await scheduleApprovalsSummaryNotification([
        approval,
        { ...approval, actionId: 'quiet-approval-2' },
      ]);
      await scheduleRunCompletedNotification('Finished', { runId: 'quiet-run' });
      await scheduleRunStallNotification('quiet-run', 'quiet-session');

      const scheduled = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map(
        ([request]) => request.content,
      );
      expect(scheduled).toHaveLength(4);
      for (const content of scheduled) {
        expect(content.priority).toBe(Notifications.AndroidNotificationPriority.LOW);
        expect(content.sound).toBeUndefined();
      }
      expect(scheduled.map((content) => content.channelId)).toEqual([
        'hermes-approvals-quiet-v2',
        'hermes-approvals-quiet-v2',
        'hermes-results-quiet-v2',
        'hermes-results-quiet-v2',
      ]);
    });
  });
});
