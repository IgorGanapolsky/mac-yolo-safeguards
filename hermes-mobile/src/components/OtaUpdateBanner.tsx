import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useOtaUpdateBanner } from '../hooks/useOtaUpdateBanner';
import { colors } from '../theme/colors';

/**
 * Auto-checks for OTA updates and surfaces a dismissible banner when one is
 * available. Uses `useOtaUpdateBanner` hook which wraps expo-updates.
 *
 * No-ops in debug builds (Updates.isEnabled === false).
 */
export default function OtaUpdateBanner() {
  const { state, message, dismiss, applyNow } = useOtaUpdateBanner();

  if (state === 'idle') return null;

  const isPending = state === 'pending';
  const isReloading = state === 'reloading';
  const label = isPending || isReloading ? 'Restart' : 'Download & restart';

  return (
    <View style={styles.container} testID="ota-update-banner">
      <View style={styles.content}>
        <Text style={styles.title}>
          {isPending ? 'Update ready' : 'Update available'}
        </Text>
        <Text style={styles.subtitle}>{message}</Text>
      </View>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={applyNow}
        disabled={isReloading}
        testID="ota-update-apply"
      >
        {isReloading ? (
          <ActivityIndicator size="small" color={colors.backgroundStart} />
        ) : (
          <Text style={styles.actionText}>{label}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dismissBtn}
        onPress={dismiss}
        testID="ota-update-dismiss"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.dismissText}>x</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(99, 102, 241, 0.3)',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.secondary,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.secondary,
    marginLeft: 10,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.backgroundStart,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  dismissText: {
    fontSize: 20,
    fontWeight: '400',
    color: colors.textMuted,
    lineHeight: 22,
  },
});
