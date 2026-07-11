import type { GatewaySettings } from '../types/gateway';

export type NotificationPreferenceFields = Pick<
  GatewaySettings,
  | 'notificationApprovals'
  | 'notificationLiveRunStatus'
  | 'notificationCompletion'
  | 'notificationsEnabled'
>;

export function deriveNotificationsEnabled(
  prefs: Pick<
    GatewaySettings,
    'notificationApprovals' | 'notificationLiveRunStatus' | 'notificationCompletion'
  >,
): boolean {
  return (
    prefs.notificationApprovals ||
    prefs.notificationLiveRunStatus ||
    prefs.notificationCompletion
  );
}

/** Migrate legacy `notificationsEnabled` to per-purpose toggles on first load. */
export function migrateNotificationPreferences(
  parsed: Partial<GatewaySettings>,
): NotificationPreferenceFields {
  const hasGranular =
    typeof parsed.notificationApprovals === 'boolean' ||
    typeof parsed.notificationLiveRunStatus === 'boolean' ||
    typeof parsed.notificationCompletion === 'boolean';

  if (hasGranular) {
    const notificationApprovals = parsed.notificationApprovals ?? true;
    const notificationLiveRunStatus = parsed.notificationLiveRunStatus ?? true;
    const notificationCompletion = parsed.notificationCompletion ?? true;
    return {
      notificationApprovals,
      notificationLiveRunStatus,
      notificationCompletion,
      notificationsEnabled: deriveNotificationsEnabled({
        notificationApprovals,
        notificationLiveRunStatus,
        notificationCompletion,
      }),
    };
  }

  const legacy = parsed.notificationsEnabled ?? true;
  return {
    notificationApprovals: legacy,
    notificationLiveRunStatus: legacy,
    notificationCompletion: legacy,
    notificationsEnabled: legacy,
  };
}

export function withDerivedNotificationsEnabled(
  settings: GatewaySettings,
): GatewaySettings {
  return {
    ...settings,
    notificationsEnabled: deriveNotificationsEnabled(settings),
  };
}
