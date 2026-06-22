import { AppState, Platform } from 'react-native';
import type { PendingApproval } from '../types/gateway';

type NotificationModule = typeof import('expo-notifications');

let notificationsModule: NotificationModule | null = null;

const CATEGORY_APPROVAL = 'hermes_approval';
const CATEGORY_RUN = 'hermes_run';
const CHANNEL_APPROVALS = 'hermes-approvals';
const CHANNEL_RUNS = 'hermes-runs';
const RUN_STATUS_NOTIFICATION_ID = 'hermes-run-status';

let lastRunStatusAt = 0;
const RUN_STATUS_MIN_INTERVAL_MS = 12_000;

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

export async function initHermesNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_APPROVALS, {
      name: 'Approvals',
      description: 'Command approvals from your Mac gateway',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_RUNS, {
      name: 'Hermes activity',
      description: 'Run progress while Hermes works on your Mac',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  await Notifications.setNotificationCategoryAsync(CATEGORY_APPROVAL, [
    {
      identifier: 'approve_once',
      buttonTitle: 'Approve',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'deny',
      buttonTitle: 'Deny',
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(CATEGORY_RUN, [
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

export async function scheduleApprovalNotification(pending: PendingApproval): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  const granted = await requestHermesNotificationPermission();
  if (!granted) {
    return;
  }

  const preview = (pending.command || pending.reason || 'Approval needed').slice(0, 120);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Hermes — approval needed',
      subtitle: pending.command ? 'Terminal command' : 'Action',
      body: preview,
      categoryIdentifier: CATEGORY_APPROVAL,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_APPROVALS } : {}),
      data: {
        actionId: pending.actionId,
        runId: pending.runId,
        choice: 'once',
        type: 'approval',
      },
    },
    trigger: null,
  });
}

/** Throttled rich notification for background run progress (replaces prior status). */
export async function scheduleRunProgressNotification(
  label: string,
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

  const body = label.replace(/^⌛\s*Working\s*—\s*/i, '').slice(0, 180);

  await Notifications.scheduleNotificationAsync({
    identifier: RUN_STATUS_NOTIFICATION_ID,
    content: {
      title: 'Hermes is working',
      subtitle: 'Mac gateway',
      body,
      categoryIdentifier: CATEGORY_RUN,
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_RUNS,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            sticky: true,
          }
        : {}),
      data: {
        type: 'run_progress',
        runId: options?.runId,
      },
    },
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

export type ApprovalNotificationAction = {
  actionId: string;
  runId?: string;
  choice: 'once' | 'deny';
};

export function parseApprovalNotificationResponse(
  response: unknown,
): ApprovalNotificationAction | null {
  if (!response || typeof response !== 'object') {
    return null;
  }
  const typed = response as {
    actionIdentifier?: string;
    notification?: { request?: { content?: { data?: Record<string, unknown> } } };
  };
  const actionId = typed.notification?.request?.content?.data?.actionId;
  if (typeof actionId !== 'string' || !actionId) {
    return null;
  }
  const runId =
    typeof typed.notification?.request?.content?.data?.runId === 'string'
      ? typed.notification.request.content.data.runId
      : undefined;

  if (typed.actionIdentifier === 'approve_once') {
    return { actionId, runId, choice: 'once' };
  }
  if (typed.actionIdentifier === 'deny') {
    return { actionId, runId, choice: 'deny' };
  }
  return null;
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
