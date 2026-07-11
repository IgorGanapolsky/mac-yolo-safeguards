import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import {
  deriveNotificationsEnabled,
  migrateNotificationPreferences,
  withDerivedNotificationsEnabled,
} from '../utils/notificationPreferences';

describe('notificationPreferences', () => {
  it('derives master flag when any per-purpose toggle is on', () => {
    expect(
      deriveNotificationsEnabled({
        notificationApprovals: false,
        notificationLiveRunStatus: false,
        notificationCompletion: false,
      }),
    ).toBe(false);
    expect(
      deriveNotificationsEnabled({
        notificationApprovals: true,
        notificationLiveRunStatus: false,
        notificationCompletion: false,
      }),
    ).toBe(true);
    expect(
      deriveNotificationsEnabled({
        notificationApprovals: false,
        notificationLiveRunStatus: true,
        notificationCompletion: false,
      }),
    ).toBe(true);
    expect(
      deriveNotificationsEnabled({
        notificationApprovals: false,
        notificationLiveRunStatus: false,
        notificationCompletion: true,
      }),
    ).toBe(true);
  });

  it('migrates legacy notificationsEnabled to all three categories', () => {
    expect(migrateNotificationPreferences({ notificationsEnabled: false })).toEqual({
      notificationApprovals: false,
      notificationLiveRunStatus: false,
      notificationCompletion: false,
      notificationsEnabled: false,
    });
    expect(migrateNotificationPreferences({ notificationsEnabled: true })).toEqual({
      notificationApprovals: true,
      notificationLiveRunStatus: true,
      notificationCompletion: true,
      notificationsEnabled: true,
    });
  });

  it('defaults missing granular fields to true when any granular key exists', () => {
    expect(migrateNotificationPreferences({ notificationApprovals: false })).toEqual({
      notificationApprovals: false,
      notificationLiveRunStatus: true,
      notificationCompletion: true,
      notificationsEnabled: true,
    });
  });

  it('re-derives notificationsEnabled on save', () => {
    const saved = withDerivedNotificationsEnabled({
      ...DEFAULT_GATEWAY_SETTINGS,
      notificationApprovals: true,
      notificationLiveRunStatus: false,
      notificationCompletion: false,
      notificationsEnabled: true,
    });
    expect(saved.notificationsEnabled).toBe(true);

    const allOff = withDerivedNotificationsEnabled({
      ...DEFAULT_GATEWAY_SETTINGS,
      notificationApprovals: false,
      notificationLiveRunStatus: false,
      notificationCompletion: false,
      notificationsEnabled: true,
    });
    expect(allOff.notificationsEnabled).toBe(false);
  });
});
