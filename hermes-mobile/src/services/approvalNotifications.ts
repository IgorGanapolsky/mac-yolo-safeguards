import { Platform } from 'react-native';
import type { PendingApproval } from '../types/gateway';

type NotificationModule = typeof import('expo-notifications');

let notificationsModule: NotificationModule | null = null;

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

const CATEGORY_ID = 'hermes_approval';

export async function initApprovalNotifications(): Promise<void> {
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

  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
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
}

export async function requestApprovalNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return false;
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted ?? false;
}

export async function scheduleApprovalNotification(pending: PendingApproval): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  const granted = await requestApprovalNotificationPermission();
  if (!granted) {
    return;
  }

  const preview = (pending.command || pending.reason || 'Approval needed').slice(0, 120);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Hermes approval needed',
      body: preview,
      categoryIdentifier: CATEGORY_ID,
      data: {
        actionId: pending.actionId,
        runId: pending.runId,
        choice: 'once',
      },
    },
    trigger: null,
  });
}

export type ApprovalNotificationAction = {
  actionId: string;
  runId?: string;
  choice: 'once' | 'deny';
};

export function parseApprovalNotificationResponse(
  response: {
    actionIdentifier: string;
    notification: { request: { content: { data?: Record<string, unknown> } } };
  },
): ApprovalNotificationAction | null {
  const actionId = response.notification.request.content.data?.actionId;
  if (typeof actionId !== 'string' || !actionId) {
    return null;
  }
  const runId =
    typeof response.notification.request.content.data?.runId === 'string'
      ? response.notification.request.content.data.runId
      : undefined;

  if (response.actionIdentifier === 'approve_once') {
    return { actionId, runId, choice: 'once' };
  }
  if (response.actionIdentifier === 'deny') {
    return { actionId, runId, choice: 'deny' };
  }
  return null;
}

export async function dismissApprovalNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  await Notifications.dismissAllNotificationsAsync();
}

export async function addApprovalNotificationResponseListener(
  onResponse: (response: any) => Promise<void>,
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
