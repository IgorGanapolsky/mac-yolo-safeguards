import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { HermesSession } from '../types/chat';
import type { RunProgressState } from '../types/chatDisplay';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';
import { humanizeRunProgressDetail } from '../utils/runProgressDisplay';

type CodexCommandCenterProps = {
  connectionState: LeashConnectionState;
  macHttpReachable?: boolean;
  pendingApprovalCount: number;
  sessions: HermesSession[];
  runProgress?: RunProgressState | null;
  isSending?: boolean;
  onOpenApprovals: () => void;
  onOpenTools: () => void;
};

function connectionCopy(
  state: LeashConnectionState,
  macHttpReachable = false,
): { label: string; detail: string; color: string } {
  if (state === 'connected') {
    return { label: 'Live', detail: 'Mac streaming', color: colors.success };
  }
  if (state === 'demo') {
    return { label: 'Demo', detail: 'Sample workspace', color: colors.accent };
  }
  if (macHttpReachable) {
    return { label: 'Online', detail: 'Ready', color: colors.success };
  }
  if (state === 'connecting') {
    return { label: 'Linking', detail: 'Checking gateway', color: colors.warning };
  }
  return { label: 'Offline', detail: 'Pair Mac first', color: colors.error };
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
  pendingApprovalCount,
  sessions,
  runProgress,
  isSending = false,
  onOpenApprovals,
  onOpenTools,
}: CodexCommandCenterProps) {
  const link = connectionCopy(connectionState, macHttpReachable);
  const showMacTile = shouldShowMacTile(connectionState, macHttpReachable);
  const showRunTile = shouldShowRunTile(runProgress, isSending);
  const toolCount = sessions.reduce((sum, session) => sum + (session.tool_call_count ?? 0), 0);
  const toolsValueLabel = toolCount > 0 ? String(toolCount) : 'Open';
  const toolsDetailLabel = toolCount > 0 ? 'Calls · all chats' : 'Skills & jobs';

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
          <View style={styles.statusTile}>
            <View style={styles.tileHeader}>
              <View style={[styles.statusDot, { backgroundColor: link.color }]} />
              <Text style={styles.tileLabel}>Mac</Text>
            </View>
            <Text style={styles.tileValue} testID="command-center-link-state">
              {link.label}
            </Text>
            <Text style={styles.tileDetail}>{link.detail}</Text>
          </View>
        ) : null}

        {showRunTile ? (
          <View style={styles.statusTile}>
            <Text style={styles.tileLabel}>Run</Text>
            <Text style={styles.tileValue} testID="command-center-run-state">
              Running
            </Text>
            <Text style={styles.tileDetail} numberOfLines={2}>
              {runDetailLabel}
            </Text>
          </View>
        ) : null}

        {pendingApprovalCount > 0 ? (
          <Pressable
            style={({ pressed }) => [styles.statusTile, pressed && styles.pressed]}
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

        <Pressable
          style={({ pressed }) => [styles.statusTile, pressed && styles.pressed]}
          onPress={onOpenTools}
          accessibilityRole="button"
          accessibilityLabel={
            toolCount > 0
              ? `Open tools — ${toolCount} tool calls across all chats on this Mac`
              : 'Open gateway tools'
          }
          testID="command-center-tools"
        >
          <Text style={styles.tileLabel}>Tools</Text>
          <Text style={styles.tileValue}>{toolsValueLabel}</Text>
          <Text style={styles.tileDetail} numberOfLines={2}>{toolsDetailLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusTile: {
    flex: 1,
    minHeight: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: 'space-between',
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
  tileLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  tileValue: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text,
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
