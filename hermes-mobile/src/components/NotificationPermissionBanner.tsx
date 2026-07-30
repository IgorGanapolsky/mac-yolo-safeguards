import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import {
  getHermesNotificationPermissionSnapshot,
  requestHermesNotificationPermissionSnapshot,
} from '../services/hermesNotifications';
import {
  clearNotificationBannerDismissal,
  loadNotificationBannerDismissal,
  saveNotificationBannerDismissal,
} from '../services/notificationPermissionPrefs';
import {
  resolveNotificationPermissionBanner,
  shouldEscalateToSystemSettings,
  type NotificationBannerDismissal,
  type NotificationPermissionSnapshot,
} from '../utils/notificationPermissionBanner';

/**
 * Degraded-capability banner shown on the Leash tab when approval notifications cannot
 * be delivered. Self-contained on purpose: ApprovalsScreen only renders <NotificationPermissionBanner />.
 *
 * Re-checks permission on focus and on foreground, so returning from system settings
 * clears the banner without a relaunch, and a mid-session revoke surfaces it.
 */
export default function NotificationPermissionBanner() {
  const [permission, setPermission] = useState<NotificationPermissionSnapshot | null>(null);
  const [dismissal, setDismissal] = useState<NotificationBannerDismissal | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (Platform.OS === 'web') {
      return;
    }
    const [snapshot, storedDismissal] = await Promise.all([
      getHermesNotificationPermissionSnapshot(),
      loadNotificationBannerDismissal(),
    ]);
    setPermission(snapshot);
    setNowMs(Date.now());
    if (snapshot?.granted) {
      // Permission recovered — drop the snooze so a later revoke warns immediately.
      setDismissal(null);
      void clearNotificationBannerDismissal();
      return;
    }
    setDismissal(storedDismissal);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const banner = resolveNotificationPermissionBanner({ permission, dismissal, nowMs });

  const onPressCta = useCallback(async () => {
    if (!banner) {
      return;
    }
    if (banner.variant === 'system-settings') {
      await Linking.openSettings();
      return;
    }
    const after = await requestHermesNotificationPermissionSnapshot();
    if (after?.granted) {
      setPermission(after);
      setDismissal(null);
      void clearNotificationBannerDismissal();
      return;
    }
    if (after) {
      setPermission(after);
      // "Tap to allow" just became a lie — send the user where it can actually be fixed.
      if (shouldEscalateToSystemSettings({ variant: banner.variant, afterRequest: after })) {
        await Linking.openSettings();
      }
    }
  }, [banner]);

  const onPressDismiss = useCallback(() => {
    if (!banner) {
      return;
    }
    const record: NotificationBannerDismissal = { variant: banner.variant, atMs: Date.now() };
    setDismissal(record);
    setNowMs(Date.now());
    void saveNotificationBannerDismissal(record);
  }, [banner]);

  if (!banner) {
    return null;
  }

  return (
    <View style={styles.banner} testID="leash-notification-permission-banner">
      <View style={styles.textCol}>
        <Text style={styles.title} testID="leash-notification-permission-title">
          {banner.title}
        </Text>
        <Text style={styles.body} testID="leash-notification-permission-body">
          {banner.body}
        </Text>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => void onPressCta()}
          testID="leash-notification-permission-cta"
          accessibilityRole="button"
          accessibilityLabel={banner.ctaLabel}
        >
          <Text style={styles.ctaText}>{banner.ctaLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={onPressDismiss}
          testID="leash-notification-permission-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Remind me later"
        >
          <Text style={styles.dismissText}>Later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 10,
  },
  textCol: {
    gap: 4,
  },
  title: {
    color: colors.warning,
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ctaBtn: {
    backgroundColor: colors.warning,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  ctaText: {
    color: '#1F2937',
    fontSize: 13,
    fontWeight: '700',
  },
  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dismissText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
