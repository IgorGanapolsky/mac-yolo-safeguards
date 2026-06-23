import { AppState, Platform } from 'react-native';
import type { RunProgressState } from '../types/chatDisplay';
import type { PendingApproval } from '../types/gateway';
import { formatRunProgressLabel } from '../utils/chatStreamEvents';

type NotificationModule = typeof import('expo-notifications');
type NotificationContentInput = import('expo-notifications').NotificationContentInput;

let notificationsModule: NotificationModule | null = null;

const CATEGORY_APPROVAL = 'hermes_approval';
const CATEGORY_RUN = 'hermes_run';
const CHANNEL_APPROVALS = 'hermes-approvals';
const CHANNEL_RUNS = 'hermes-runs';
const CHANNEL_RESULTS = 'hermes-results';
const RUN_STATUS_NOTIFICATION_ID = 'hermes-run-status';
const RUN_COMPLETED_NOTIFICATION_ID = 'hermes-run-completed';

const THREAD_APPROVALS = 'hermes.thread.approvals';
const THREAD_RUNS = 'hermes.thread.runs';
const NOTIFICATION_COLOR = '#6366F1';

let lastRunStatusAt = 0;
const RUN_STATUS_MIN_INTERVAL_MS = 8_000;

export type HermesNotificationTab = 'Chat' | 'Leash';

export type HermesNotificationAction =
  | { kind: 'approval'; actionId: string; runId?: string; choice: 'once' | 'deny' }
  | { kind: 'navigate'; tab: HermesNotificationTab }
  | { kind: 'stop_run'; runId?: string };

export type ApprovalNotificationAction = {
  actionId: string;
  runId?: string;
  choice: 'once' | 'deny';
};

async function loadNotifications(): Promise<NotificationModule | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  if (!notificationsModule) {
    try {
      notificationsModule = await import('expo-notifications');
    } catch {
      return null;
    }
  }
  return notificationsModule;
}

function notificationData(response: unknown): Record<string, unknown> | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  const typed = response as {
    notification?: { request?: { content?: { data?: Record<string, unknown> } } };
  };
  return typed.notification?.request?.content?.data;
}

function actionIdentifier(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  const id = (response as { actionIdentifier?: string }).actionIdentifier;
  return typeof id === 'string' ? id : undefined;
}

export function approvalNotificationSubtitle(pending: PendingApproval): string {
  const tier =
    pending.riskTier === 'high'
      ? 'High risk'
      : pending.riskTier === 'medium'
        ? 'Medium risk'
        : pending.riskTier === 'low'
          ? 'Low risk'
          : undefined;
  const kind = pending.command
    ? 'Shell command'
    : pending.toolName?.trim()
      ? pending.toolName.trim()
      : 'Gateway action';
  return tier ? `${tier} · ${kind}` : kind;
}

export function runProgressNotificationTitle(progress: RunProgressState): string {
  if (progress.phase === 'approval') {
    return 'Waiting for your approval';
  }
  if (progress.phase === 'streaming') {
    return 'Hermes is responding';
  }
  return 'Hermes is working';
}

export function parseHermesNotificationResponse(response: unknown): HermesNotificationAction | null {
  const action = actionIdentifier(response);
  if (action === 'view_chat') {
    return { kind: 'navigate', tab: 'Chat' };
  }
  if (action === 'view_approvals') {
    return { kind: 'navigate', tab: 'Leash' };
  }
  if (action === 'stop_run') {
    const data = notificationData(response);
    const runId = typeof data?.runId === 'string' ? data.runId : undefined;
    return { kind: 'stop_run', runId };
  }

  const data = notificationData(response);
  const actionId = data?.actionId;
  if (typeof actionId !== 'string' || !actionId) {
    return null;
  }
  const runId = typeof data?.runId === 'string' ? data.runId : undefined;

  if (action === 'approve_once') {
    return { kind: 'approval', actionId, runId, choice: 'once' };
  }
  if (action === 'deny') {
    return { kind: 'approval', actionId, runId, choice: 'deny' };
  }
  return null;
}

export function parseApprovalNotificationResponse(
  response: unknown,
): ApprovalNotificationAction | null {
  const parsed = parseHermesNotificationResponse(response);
  if (!parsed || parsed.kind !== 'approval') {
    return null;
  }
  return {
    actionId: parsed.actionId,
    runId: parsed.runId,
    choice: parsed.choice,
  };
}

export async function initHermesNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data;
      const type = typeof data?.type === 'string' ? data.type : '';
      const foreground = AppState.currentState === 'active';
      const suppressRunBanner = foreground && type === 'run_progress';

      return {
        shouldShowAlert: !suppressRunBanner,
        shouldPlaySound: type === 'approval' && !foreground,
        shouldSetBadge: true,
        shouldShowBanner: !suppressRunBanner,
        shouldShowList: true,
      };
    },
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_APPROVALS, {
      name: 'Approvals',
      description: 'Urgent computer gateway approvals with Approve and Deny actions',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 220, 120, 220],
      lightColor: NOTIFICATION_COLOR,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_RUNS, {
      name: 'Live activity',
      description: 'Ongoing status while Hermes works on your computer',
      importance: Notifications.AndroidImportance.LOW,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_RESULTS, {
      name: 'Results',
      description: 'When a background task finishes on your computer',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  await Notifications.setNotificationCategoryAsync(CATEGORY_APPROVAL, [
    {
      identifier: 'approve_once',
      buttonTitle: 'Approve once',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'deny',
      buttonTitle: 'Deny',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'view_approvals',
      buttonTitle: 'Open approvals',
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(CATEGORY_RUN, [
    {
      identifier: 'stop_run',
      buttonTitle: 'Stop Run',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'view_chat',
      buttonTitle: 'Open chat',
      options: { opensAppToForeground: true },
    },
  ]);
}

/** @deprecated use initHermesNotifications */
export const initApprovalNotifications = initHermesNotifications;

export async function requestHermesNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return false;
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return requested.granted ?? false;
}

/** @deprecated */
export const requestApprovalNotificationPermission = requestHermesNotificationPermission;

export async function syncHermesNotificationBadge(count: number): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    /* badge unsupported on some Android launchers */
  }
}

export async function scheduleApprovalNotification(
  pending: PendingApproval,
  options?: { badgeCount?: number },
): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  const granted = await requestHermesNotificationPermission();
  if (!granted) {
    return;
  }

  const preview = (pending.command || pending.reason || 'Approval needed').slice(0, 160);
  const badge = options?.badgeCount ?? 1;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Approval needed on your computer',
      subtitle: approvalNotificationSubtitle(pending),
      body: preview,
      categoryIdentifier: CATEGORY_APPROVAL,
      sound: 'default',
      badge,
      threadIdentifier: THREAD_APPROVALS,
      ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' as const } : {}),
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_APPROVALS,
            color: NOTIFICATION_COLOR,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          }
        : {}),
      data: {
        actionId: pending.actionId,
        runId: pending.runId,
        choice: 'once',
        type: 'approval',
        riskTier: pending.riskTier,
      },
    } as NotificationContentInput,
    trigger: null,
  });
}

/** Throttled live-activity style notification for background run progress. */
export async function scheduleRunProgressNotification(
  progress: RunProgressState,
  options?: { runId?: string; force?: boolean },
): Promise<void> {
  if (AppState.currentState === 'active') {
    return;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  const granted = await requestHermesNotificationPermission();
  if (!granted) {
    return;
  }

  const now = Date.now();
  if (!options?.force && now - lastRunStatusAt < RUN_STATUS_MIN_INTERVAL_MS) {
    return;
  }
  lastRunStatusAt = now;

  const body = formatRunProgressLabel(progress)
    .replace(/^⌛\s*Working\s*—\s*/i, '')
    .slice(0, 180);

  await Notifications.scheduleNotificationAsync({
    identifier: RUN_STATUS_NOTIFICATION_ID,
    content: {
      title: runProgressNotificationTitle(progress),
      subtitle: 'Computer gateway · live status',
      body,
      categoryIdentifier: CATEGORY_RUN,
      threadIdentifier: THREAD_RUNS,
      ...(Platform.OS === 'ios' ? { interruptionLevel: 'passive' as const } : {}),
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_RUNS,
            color: NOTIFICATION_COLOR,
            priority: Notifications.AndroidNotificationPriority.LOW,
            sticky: true,
            autoDismiss: false,
          }
        : {}),
      data: {
        type: 'run_progress',
        runId: options?.runId,
        phase: progress.phase,
      },
    } as NotificationContentInput,
    trigger: null,
  });
}

export async function scheduleRunCompletedNotification(
  detail: string,
  options?: { success?: boolean; runId?: string },
): Promise<void> {
  if (AppState.currentState === 'active') {
    return;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  const granted = await requestHermesNotificationPermission();
  if (!granted) {
    return;
  }

  await clearRunProgressNotification();

  const trimmed = detail.trim().slice(0, 180);
  const success = options?.success ?? true;

  await Notifications.scheduleNotificationAsync({
    identifier: RUN_COMPLETED_NOTIFICATION_ID,
    content: {
      title: success ? 'Hermes finished' : 'Hermes run stopped',
      subtitle: success ? 'Computer gateway' : 'Check chat for details',
      body: trimmed || (success ? 'Background task completed.' : 'The run ended with an error.'),
      categoryIdentifier: CATEGORY_RUN,
      threadIdentifier: THREAD_RUNS,
      sound: success ? 'default' : undefined,
      ...(Platform.OS === 'ios' ? { interruptionLevel: 'active' as const } : {}),
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_RESULTS,
            color: NOTIFICATION_COLOR,
            priority: Notifications.AndroidNotificationPriority.DEFAULT,
          }
        : {}),
      data: {
        type: 'run_completed',
        runId: options?.runId,
        success,
      },
    } as NotificationContentInput,
    trigger: null,
  });
}

export async function clearRunProgressNotification(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(RUN_STATUS_NOTIFICATION_ID);
    await Notifications.dismissNotificationAsync(RUN_STATUS_NOTIFICATION_ID);
  } catch {
    /* ignore */
  }
  lastRunStatusAt = 0;
}

export const RUN_STALL_NOTIFICATION_ID = 'hermes-run-stall';

export async function scheduleRunStallNotification(runId?: string): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  await cancelRunStallNotification();

  const granted = await requestHermesNotificationPermission();
  if (!granted) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: RUN_STALL_NOTIFICATION_ID,
    content: {
      title: 'Hermes run might be stalled',
      subtitle: 'Computer gateway · warning',
      body: 'No updates from your computer for 45 seconds. Open chat or stop the run.',
      categoryIdentifier: CATEGORY_RUN,
      threadIdentifier: THREAD_RUNS,
      sound: 'default',
      ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' as const } : {}),
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_RESULTS,
            color: NOTIFICATION_COLOR,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          }
        : {}),
      data: {
        type: 'run_stall',
        runId,
      },
    } as NotificationContentInput,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 45,
      repeats: false,
    },
  });
}

export async function cancelRunStallNotification(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(RUN_STALL_NOTIFICATION_ID);
    await Notifications.dismissNotificationAsync(RUN_STALL_NOTIFICATION_ID);
  } catch {
    /* ignore */
  }
}

export async function dismissHermesNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  await Notifications.dismissAllNotificationsAsync();
}

/** @deprecated */
export const dismissApprovalNotifications = dismissHermesNotifications;

export async function addApprovalNotificationResponseListener(
  onResponse: (response: unknown) => Promise<void>,
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return null;
  }
  const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
  return {
    remove: () => subscription.remove(),
  };
}
