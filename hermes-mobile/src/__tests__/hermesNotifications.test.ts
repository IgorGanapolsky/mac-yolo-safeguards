import {
  approvalNotificationSubtitle,
  androidStatusChannelImportance,
  CHANNEL_RESULTS_V2,
  CHANNEL_STATUS_V2,
  clearRunProgressNotification,
  cancelRunStallNotification,
  initHermesNotifications,
  parseApprovalNotificationResponse,
  parseHermesNotificationResponse,
  resolveHermesNotificationHandlerResult,
  RUN_STATUS_MIN_INTERVAL_MS,
  runProgressNotificationTitle,
  scheduleRunCompletedNotification,
  scheduleApprovalsSummaryNotification,
  scheduleRunProgressNotification,
  scheduleRunStallNotification,
  shouldDismissRunNotificationsForAppState,
  resetApprovalNotificationState,
  syncHermesNotificationBadge,
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
    expect(
      runProgressNotificationTitle({
        phase: 'completed',
        startedAtMs: Date.now(),
        replyPreview: 'The requested work is ready.',
      }),
    ).toBe('Hermes replied');
    expect(
      runProgressNotificationTitle({
        phase: 'completed',
        startedAtMs: Date.now(),
      }),
    ).toBe('Hermes finished');
  });

  it('dismisses run notifications when the app is foregrounded', () => {
    expect(shouldDismissRunNotificationsForAppState('active')).toBe(true);
    expect(shouldDismissRunNotificationsForAppState('background')).toBe(false);
    expect(shouldDismissRunNotificationsForAppState('inactive')).toBe(false);
  });

  it('uses v2 quiet channel ids and LOW importance (never HIGH)', () => {
    expect(CHANNEL_STATUS_V2).toBe('hermes-status-v2');
    expect(CHANNEL_RESULTS_V2).toBe('hermes-results-v2');
    expect(RUN_STATUS_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
    const importance = androidStatusChannelImportance(Notifications.AndroidImportance);
    expect(importance).toBe(Notifications.AndroidImportance.LOW);
    expect(importance).toBeLessThan(Notifications.AndroidImportance.DEFAULT);
    expect(importance).toBeLessThan(Notifications.AndroidImportance.HIGH);
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

  describe('quiet status channel posting', () => {
    const originalCurrentState = AppState.currentState;
    const originalOS = Platform.OS;

    beforeEach(async () => {
      Object.defineProperty(AppState, 'currentState', {
        value: 'background',
        configurable: true,
      });
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      jest.clearAllMocks();
      jest.useFakeTimers({ now: 1_000_000 });
      await clearRunProgressNotification();
      await cancelRunStallNotification();
      jest.clearAllMocks();
    });

    afterEach(() => {
      Object.defineProperty(AppState, 'currentState', {
        value: originalCurrentState,
        configurable: true,
      });
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
      jest.useRealTimers();
      jest.clearAllMocks();
    });

    it('posts run progress on hermes-status-v2 with LOW priority and stable id', async () => {
      await scheduleRunProgressNotification(
        { phase: 'streaming', startedAtMs: Date.now(), detail: 'Live streaming' },
        { runId: 'run-1', sessionId: 'sess-1', force: true },
      );

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.identifier).toBe('hermes-run-status');
      expect(call.content.channelId).toBe(CHANNEL_STATUS_V2);
      expect(call.content.priority).toBe(Notifications.AndroidNotificationPriority.LOW);
      expect(call.content.data.type).toBe('run_progress');
    });

    it('removes elapsed and computer-centric copy from a completed progress notification', async () => {
      await scheduleRunProgressNotification(
        {
          phase: 'completed',
          startedAtMs: Date.now() - 180_000,
          duration: 180,
          detail: 'Reply ready on your computer',
        },
        { runId: 'run-2', sessionId: 'sess-2', force: true },
      );

      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.content.title).toBe('Hermes finished');
      expect(call.content.body).toBe('Reply ready — open chat to read it.');
      expect(call.content.body).not.toMatch(/3\s*min|computer/i);
    });

    it('uses an available reply excerpt in the completion notification', async () => {
      await scheduleRunCompletedNotification('The OTA fix is merged and ready to verify.', {
        success: true,
        runId: 'run-3',
        sessionId: 'sess-3',
      });

      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.content.title).toBe('Hermes replied');
      expect(call.content.subtitle).toBe('Reply received');
      expect(call.content.body).toBe('The OTA fix is merged and ready to verify.');
    });

    it('uses reply snippet as body and never leads with elapsed minutes', async () => {
      await scheduleRunProgressNotification(
        {
          phase: 'completed',
          startedAtMs: Date.now() - 180_000,
          detail: 'Reply ready on your computer',
          replyPreview: 'Here is the revenue status for today.',
        },
        { force: true },
      );

      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.content.title).toBe('Hermes replied');
      expect(call.content.body).toBe('Here is the revenue status for today.');
      expect(call.content.body).not.toMatch(/^\d+\s*min/);
      expect(call.content.body).not.toContain('3 min');
    });

    it('rate-limits even when force is set so stream tokens cannot spam', async () => {
      await scheduleRunProgressNotification(
        { phase: 'streaming', startedAtMs: Date.now() },
        { force: true },
      );
      await scheduleRunProgressNotification(
        { phase: 'streaming', startedAtMs: Date.now() },
        { force: true },
      );
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

      jest.setSystemTime(1_000_000 + 2_500);
      await scheduleRunProgressNotification(
        { phase: 'streaming', startedAtMs: Date.now() },
        { force: true },
      );
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    });

    it('registers quiet v2 channels at LOW importance during init', async () => {
      await initHermesNotifications();
      const channelCalls = (Notifications.setNotificationChannelAsync as jest.Mock).mock.calls;
      const status = channelCalls.find((c) => c[0] === CHANNEL_STATUS_V2);
      const results = channelCalls.find((c) => c[0] === CHANNEL_RESULTS_V2);
      expect(status?.[1].importance).toBe(Notifications.AndroidImportance.LOW);
      expect(results?.[1].importance).toBe(Notifications.AndroidImportance.LOW);
      expect(status?.[1].importance).toBeLessThan(Notifications.AndroidImportance.HIGH);
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

    it('never peeks for live status types even in background', () => {
      for (const appState of ['background', 'inactive'] as const) {
        for (const type of ['run_progress', 'run_stall', 'run_completed'] as const) {
          const result = handlerPresentation(appState, type);
          expect(result.shouldShowBanner).toBe(false);
          expect(result.shouldShowAlert).toBe(false);
          expect(result.shouldPlaySound).toBe(false);
          expect(result.shouldShowList).toBe(true);
        }
      }
    });

    it('allows approval banners only when not active', () => {
      const active = handlerPresentation('active', 'approval');
      expect(active.shouldShowBanner).toBe(false);

      const background = handlerPresentation('background', 'approval');
      expect(background.shouldShowBanner).toBe(true);
      expect(background.shouldPlaySound).toBe(true);
    });
  });

  describe('approvals summary re-fire guard', () => {
    const originalCurrentState = AppState.currentState;
    const pair = [
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
    ];

    beforeEach(() => {
      Object.defineProperty(AppState, 'currentState', {
        value: 'background',
        configurable: true,
      });
      resetApprovalNotificationState();
      jest.clearAllMocks();
      jest.useFakeTimers({ now: 2_000_000 });
    });

    afterEach(() => {
      Object.defineProperty(AppState, 'currentState', {
        value: originalCurrentState,
        configurable: true,
      });
      jest.useRealTimers();
      resetApprovalNotificationState();
      jest.clearAllMocks();
    });

    it('does not re-alert the same pending set on every poll tick', async () => {
      await scheduleApprovalsSummaryNotification(pair, { badgeCount: 2 });
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const first = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(first.content.sound).toBe('default');
      expect(first.content.badge).toBe(2);

      jest.clearAllMocks();
      await scheduleApprovalsSummaryNotification(pair, { badgeCount: 2 });
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('caps OS badge at 99', async () => {
      await syncHermesNotificationBadge(5557);
      expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(99);
    });

    it('titles summary as 99+ when count exceeds display cap', async () => {
      const huge = Array.from({ length: 120 }, (_, i) => ({
        actionId: `act-${i}`,
        toolName: 'bash',
        reason: 'x',
        receivedAt: '',
      }));
      await scheduleApprovalsSummaryNotification(huge, { badgeCount: 5557 });
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.content.title).toBe('99+ approvals waiting');
      expect(call.content.badge).toBe(99);
    });
  });
});
