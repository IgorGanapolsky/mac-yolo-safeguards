import React from 'react';
import {
  StyleSheet,
  Text,
  Pressable,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGateway } from '../context/GatewayContext';
import { useOtaUpdateBanner } from '../hooks/useOtaUpdateBanner';
import { colors } from '../theme/colors';
import { hasValidSavedComputer } from '../utils/freshUserOnboarding';
import {
  otaBannerActionMinSize,
  otaBannerTopPadding,
} from '../utils/otaBannerLayout';

/**
 * Auto-checks for OTA updates and surfaces a dismissible banner when one is
 * available. Uses `useOtaUpdateBanner` hook which wraps expo-updates.
 *
 * Mounted above navigation in App.tsx — MUST pad for status-bar / cutout
 * insets itself (ChatScreen SafeAreaView does not wrap this banner).
 *
 * No-ops in debug builds (Updates.isEnabled === false).
 */
export default function OtaUpdateBanner() {
  const insets = useSafeAreaInsets();
  const { bootstrapReady, gatewayProfiles } = useGateway();
  const { state, message, dismiss, applyNow } = useOtaUpdateBanner({
    isFirstSession: bootstrapReady && !hasValidSavedComputer(gatewayProfiles),
    isOnboardingResolved: bootstrapReady,
  });

  if (state === 'idle') return null;

  const isPending = state === 'pending';
  const isReloading = state === 'reloading';
  const label = isPending || isReloading ? 'Restart' : 'Download & restart';
  const minTap = otaBannerActionMinSize();

  return (
    <View
      style={[styles.container, { paddingTop: otaBannerTopPadding(insets.top) }]}
      testID="ota-update-banner"
      accessibilityRole="summary"
    >
      <View style={styles.content}>
        <Text style={styles.title} testID="ota-update-banner-title">
          {isPending ? 'Update ready' : 'Update available'}
        </Text>
        <Text style={styles.subtitle}>{message}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.actionBtn,
          { minHeight: minTap, minWidth: minTap },
          pressed && !isReloading && styles.actionBtnPressed,
          isReloading && styles.actionBtnDisabled,
        ]}
        onPress={() => {
          void applyNow();
        }}
        disabled={isReloading}
        testID="ota-update-apply"
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
      >
        {isReloading ? (
          <ActivityIndicator size="small" color={colors.backgroundStart} />
        ) : (
          <Text style={styles.actionText}>{label}</Text>
        )}
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.dismissBtn,
          { minHeight: minTap, minWidth: minTap },
          pressed && styles.dismissBtnPressed,
        ]}
        onPress={dismiss}
        testID="ota-update-dismiss"
        accessibilityRole="button"
        accessibilityLabel="Dismiss update"
        hitSlop={8}
      >
        <Text style={styles.dismissText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(99, 102, 241, 0.3)',
    zIndex: 50,
    elevation: 50,
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.secondary,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionBtnDisabled: {
    opacity: 0.7,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.backgroundStart,
  },
  dismissBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
    borderRadius: 8,
  },
  dismissBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dismissText: {
    fontSize: 22,
    fontWeight: '400',
    color: colors.textMuted,
    lineHeight: 24,
  },
});
