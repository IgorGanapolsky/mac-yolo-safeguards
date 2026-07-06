import {
  approvalNotificationSubtitle,
  parseApprovalNotificationResponse,
  parseHermesNotificationResponse,
  runProgressNotificationTitle,
  scheduleRunProgressNotification,
  scheduleRunStallNotification,
  shouldDismissRunNotificationsForAppState,
} from '../services/hermesNotifications';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import { setChatScreenForegroundFocused } from '../services/runNotificationContext';

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
      runProgressNotificationTitle(
        {
          phase: 'approval',
          startedAtMs: Date.now(),
        },
        { projectName: 'mac-yolo', promptSnippet: 'ship notifications' },
      ),
    ).toBe('mac-yolo · Needs approval');
    expect(
      runProgressNotificationTitle(
        {
          phase: 'streaming',
          startedAtMs: Date.now(),
        },
        { promptSnippet: 'Write the summary' },
      ),
    ).toBe('Write the summary');
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

    it('does not schedule run progress while Chat is foreground even if app state is background', async () => {
      Object.defineProperty(AppState, 'currentState', {
        value: 'background',
        configurable: true,
      });
      setChatScreenForegroundFocused(true);

      await scheduleRunProgressNotification(
        { phase: 'working', startedAtMs: Date.now(), detail: 'running terminal' },
        { runId: 'run-1', sessionId: 'sess-1', force: true },
      );

      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
      setChatScreenForegroundFocused(false);
    });

    it('suppresses connectivity noise instead of posting a live-run notification', async () => {
      Object.defineProperty(AppState, 'currentState', {
        value: 'background',
        configurable: true,
      });

      await scheduleRunProgressNotification(
        {
          phase: 'failed',
          startedAtMs: Date.now() - 120_000,
          detail: 'Hermes relay is not paired yet. Pair in Settings, or add a direct computer link for Chat.',
        },
        { runId: 'run-1', sessionId: 'sess-1', force: true },
      );

      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });
});
