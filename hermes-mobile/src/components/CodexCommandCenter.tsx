import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { RunProgressState } from '../types/chatDisplay';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';
import { humanizeRunProgressDetail } from '../utils/runProgressDisplay';

type CodexCommandCenterProps = {
  connectionState: LeashConnectionState;
  macHttpReachable?: boolean;
  macRetryBusy?: boolean;
  silentHealInFlight?: boolean;
  pendingApprovalCount: number;
  runProgress?: RunProgressState | null;
  isSending?: boolean;
  onOpenApprovals: () => void;
  onMacRetry?: () => void;
  machineName?: string;
};

function connectionCopy(
  state: LeashConnectionState,
  macHttpReachable = false,
  macRetryBusy = false,
  machineName = 'Computer',
): { label: string; detail: string; color: string } {
  if (macRetryBusy) {
    return { label: machineName, detail: 'Reconnecting…', color: colors.warning };
  }
  if (state === 'demo') {
    return { label: 'Demo', detail: 'Preview', color: colors.accent };
  }
  if (macHttpReachable) {
    return { label: 'Connected', detail: 'Ready', color: colors.success };
  }
  if (state === 'connected') {
    return { label: 'Relay only', detail: 'Chat needs direct link', color: colors.warning };
  }
  if (state === 'connecting') {
    return { label: 'Connecting', detail: `Checking ${machineName}`, color: colors.warning };
  }
  return { label: 'Not connected', detail: 'Tap to reconnect', color: colors.error };
}

const INACTIVE_RUN_PHASES = new Set(['completed', 'failed', 'idle']);

function shouldShowMacTile(state: LeashConnectionState, macHttpReachable = false): boolean {
  if (state === 'connected' || state === 'demo' || macHttpReachable) {
    return false;
  }
  return true;
}

function shouldShowRunTile(runProgress?: RunProgressState | null, isSending = false): boolean {
  if (isSending && (!runProgress || !runProgress.runId)) {
    return false;
  }
  if (!runProgress) {
    return false;
  }
  return !INACTIVE_RUN_PHASES.has(runProgress.phase);
}

export default function CodexCommandCenter({
  connectionState,
  macHttpReachable = false,
  macRetryBusy = false,
  silentHealInFlight = false,
  pendingApprovalCount,
  runProgress,
  isSending = false,
  onOpenApprovals,
  onMacRetry,
  machineName = 'Computer',
}: CodexCommandCenterProps) {
  const link = connectionCopy(connectionState, macHttpReachable, macRetryBusy, machineName);
  const showMacTile =
    shouldShowMacTile(connectionState, macHttpReachable) && !silentHealInFlight;
  const showRunTile = shouldShowRunTile(runProgress, isSending);
  const showApprovalsTile = pendingApprovalCount > 0;

  if (!showMacTile && !showRunTile && !showApprovalsTile) {
    return null;
  }

  const runDetailLabel = (() => {
    if (isSending) {
      return 'Working…';
    }
    if (runProgress?.detail?.trim()) {
      return humanizeRunProgressDetail(runProgress.detail, runProgress.phase);
    }
    return 'Working…';
  })();

  return (
    <View style={styles.wrap} testID="codex-command-center">
      <View style={styles.statusRow}>
        {showMacTile ? (
          <Pressable
            style={({ pressed }) => [
              styles.statusChip,
              styles.macRetryChip,
              macRetryBusy && styles.macRetryChipBusy,
              pressed && !macRetryBusy && styles.pressed,
            ]}
            onPress={macRetryBusy ? undefined : onMacRetry}
            disabled={macRetryBusy || !onMacRetry}
            accessibilityRole="button"
            accessibilityLabel="Reconnect to computer"
            testID="command-center-mac-tile"
          >
            <View style={styles.tileHeader}>
              {macRetryBusy ? (
                <ActivityIndicator size="small" color={colors.warning} style={styles.macRetrySpinner} />
              ) : (
                <View style={[styles.statusDot, { backgroundColor: link.color }]} />
              )}
              <Text style={styles.tileLabel}>Computer</Text>
            </View>
            <Text style={styles.tileValue} testID="command-center-link-state">{link.label}</Text>
            <Text style={styles.tileDetail} numberOfLines={1} testID="command-center-mac-detail">
              {link.detail}
            </Text>
          </Pressable>
        ) : null}

        {showRunTile ? (
          <View style={styles.statusChip}>
            <Text style={styles.tileLabel}>Run</Text>
            <Text style={styles.tileValue} testID="command-center-run-state">
              Running
            </Text>
            <Text style={styles.tileDetail} numberOfLines={2}>
              {runDetailLabel}
            </Text>
          </View>
        ) : null}

        {showApprovalsTile ? (
          <Pressable
            style={({ pressed }) => [styles.statusChip, styles.pressableChip, pressed && styles.pressed]}
            onPress={onOpenApprovals}
            accessibilityRole="button"
            accessibilityLabel="Open approvals"
            testID="command-center-approvals"
          >
            <Text style={styles.tileLabel}>Leash</Text>
            <Text style={styles.tileValue}>{pendingApprovalCount}</Text>
            <Text style={styles.tileDetail}>Approvals</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusChip: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(15, 23, 42, 0.64)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'space-between',
  },
  macRetryChip: {
    borderColor: 'rgba(239, 68, 68, 0.45)',
    backgroundColor: 'rgba(127, 29, 29, 0.22)',
  },
  macRetryChipBusy: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(120, 53, 15, 0.22)',
  },
  pressableChip: {
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  macRetrySpinner: {
    width: 7,
    height: 7,
    transform: [{ scale: 0.65 }],
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  tileValue: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0,
  },
  tileDetail: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.82,
  },
});
