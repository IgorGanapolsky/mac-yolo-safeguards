import {
  approvalNotificationSubtitle,
  parseApprovalNotificationResponse,
  parseHermesNotificationResponse,
  runProgressNotificationBody,
  runProgressNotificationTitle,
  shouldPresentHermesNotification,
} from '../services/hermesNotifications';

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

  it('suppresses Hermes notification banners while app is foregrounded', () => {
    expect(shouldPresentHermesNotification({ type: 'run_stall' }, 'active')).toMatchObject({
      shouldShowAlert: false,
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
    });
    expect(shouldPresentHermesNotification({ type: 'approval', riskTier: 'high' }, 'active')).toMatchObject({
      shouldShowAlert: false,
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
    });
  });

  it('keeps background run notifications actionable and informative', () => {
    expect(shouldPresentHermesNotification({ type: 'run_stall' }, 'background')).toMatchObject({
      shouldShowBanner: true,
      shouldPlaySound: true,
    });
    expect(
      runProgressNotificationBody({
        phase: 'working',
        startedAtMs: Date.now() - 7000,
        detail: 'running terminal',
        model: 'glm-5.2',
        inputTokens: 147474,
        outputTokens: 14403,
      }),
    ).toContain('glm-5.2 · In 147474 / Out 14403');
  });
});
