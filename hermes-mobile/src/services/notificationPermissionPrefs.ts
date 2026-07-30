import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  NotificationBannerDismissal,
  NotificationBannerVariant,
} from '../utils/notificationPermissionBanner';

/**
 * Persisted dismissal of the Leash notification-permission banner.
 * Storage is deliberately dumb — every cadence decision lives in
 * `resolveNotificationPermissionBanner` so it stays unit-testable.
 */

const DISMISSAL_KEY = 'hermes-mobile:notification_banner_dismissal';

function isVariant(value: unknown): value is NotificationBannerVariant {
  return value === 'request' || value === 'system-settings';
}

export async function loadNotificationBannerDismissal(): Promise<NotificationBannerDismissal | null> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSAL_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as Partial<NotificationBannerDismissal>;
    if (!isVariant(record.variant) || typeof record.atMs !== 'number' || !Number.isFinite(record.atMs)) {
      return null;
    }
    return { variant: record.variant, atMs: record.atMs };
  } catch {
    // Corrupt or unavailable storage must never hide a degraded-capability warning.
    return null;
  }
}

export async function saveNotificationBannerDismissal(
  dismissal: NotificationBannerDismissal,
): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSAL_KEY, JSON.stringify(dismissal));
  } catch {
    /* a failed snooze just means the banner returns sooner — never fatal */
  }
}

export async function clearNotificationBannerDismissal(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DISMISSAL_KEY);
  } catch {
    /* non-fatal */
  }
}
