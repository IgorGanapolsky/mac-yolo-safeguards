import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { emptyStreamBannerHint } from '../utils/emptyStreamRefreshCta';
import ElapsedSince from './ElapsedSince';

type EmptyStreamRefreshBannerProps = {
  autoChecking?: boolean;
  busy?: boolean;
  waitingSinceMs?: number | null;
  onRefresh: () => void;
  onStartFreshChat?: () => void;
  startingFreshChat?: boolean;
};

export default function EmptyStreamRefreshBanner({
  autoChecking = false,
  busy = false,
  waitingSinceMs,
  onRefresh,
  onStartFreshChat,
  startingFreshChat = false,
}: EmptyStreamRefreshBannerProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (waitingSinceMs == null) {
      setElapsedMs(0);
      return;
    }
    const update = () => setElapsedMs(Math.max(0, Date.now() - waitingSinceMs));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [waitingSinceMs]);

  const hint = emptyStreamBannerHint(elapsedMs);

  return (
    <View style={styles.wrap} testID="empty-stream-refresh-banner">
      <View style={styles.statusRow}>
        {autoChecking ? (
          <ActivityIndicator size="small" color={colors.warning} testID="empty-stream-auto-checking" />
        ) : null}
        <View style={styles.copyColumn}>
          <Text style={styles.text}>{hint}</Text>
          {waitingSinceMs != null ? (
            <ElapsedSince
              sinceMs={waitingSinceMs}
              prominent
              prefix="Waiting"
              testID="empty-stream-elapsed"
            />
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onRefresh}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Check again now"
          accessibilityState={{ busy, disabled: busy }}
          style={({ pressed }) => [
            styles.refreshChip,
            styles.secondaryChip,
            busy && styles.chipBusy,
            pressed && !busy && styles.chipPressed,
          ]}
          testID="empty-stream-refresh-button"
        >
          {busy ? (
            <View style={styles.chipRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.refreshChipText}>Checking…</Text>
            </View>
          ) : (
            <Text style={styles.refreshChipText}>Check now</Text>
          )}
        </Pressable>
        {onStartFreshChat ? (
          <Pressable
            onPress={onStartFreshChat}
            disabled={startingFreshChat}
            accessibilityRole="button"
            accessibilityLabel="Start fresh chat"
            accessibilityState={{ busy: startingFreshChat, disabled: startingFreshChat }}
            style={({ pressed }) => [
              styles.freshChip,
              startingFreshChat && styles.chipBusy,
              pressed && !startingFreshChat && styles.chipPressed,
            ]}
            testID="empty-stream-start-fresh-chat"
          >
            {startingFreshChat ? (
              <View style={styles.chipRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.freshChipText}>Starting…</Text>
              </View>
            ) : (
              <Text style={styles.freshChipText}>Start fresh chat</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  copyColumn: {
    flex: 1,
    gap: 4,
  },
  text: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: colors.warning,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  refreshChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.45)',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  secondaryChip: {
    opacity: 0.9,
  },
  freshChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.45)',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipBusy: {
    opacity: 0.85,
  },
  chipPressed: {
    opacity: 0.82,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  freshChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
});
