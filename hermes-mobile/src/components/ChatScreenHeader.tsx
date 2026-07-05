import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { resolveChatLinkDisplay } from '../utils/gatewayConnection';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';

type ChatScreenHeaderProps = {
  threadTitle: string;
  /** When the current thread was created — shown under the title. */
  threadCreatedLabel?: string | null;
  machineLabel: string;
  machineEndpoint?: string;
  routeStatusLabel?: string;
  connectionState: LeashConnectionState;
  macHttpReachable?: boolean;
  isDemo?: boolean;
  /** Keep IP / relay detail visible when connected (multi-Mac setups). */
  showMachineDetailWhenConnected?: boolean;
  workspaceName?: string;
  workspaceHandoff?: string;
  canSwitchWorkspace?: boolean;
  activeAgents?: { name: string; status: string }[];
  onOpenThreads: () => void;
  onPressThreadTitle?: () => void;
  onOpenTools?: () => void;
  onPressMachine: () => void;
  onPressWorkspace?: () => void;
};

function linkMeta(
  state: LeashConnectionState,
  macHttpReachable = false,
  disconnectedLabel = 'Not connected',
  isDemo = false,
): { label: string; color: string; connected: boolean } {
  const link = resolveChatLinkDisplay({
    connectionState: state,
    macHttpOk: macHttpReachable,
    disconnectedLabel,
    isDemo,
  });
  if (link.chatReachable) {
    return { label: link.label, color: colors.success, connected: true };
  }
  if (link.label === 'Relay only') {
    return { label: link.label, color: colors.warning, connected: false };
  }
  if (state === 'connecting') {
    return { label: link.label, color: colors.warning, connected: false };
  }
  return { label: link.label, color: colors.error, connected: false };
}

/**
 * Conversation-first header — Claude/Codex style: title, subtle Mac line, menu affordances.
 */
export default function ChatScreenHeader({
  threadTitle,
  threadCreatedLabel,
  machineLabel,
  machineEndpoint,
  routeStatusLabel,
  connectionState,
  macHttpReachable = false,
  isDemo = false,
  showMachineDetailWhenConnected = false,
  workspaceName,
  workspaceHandoff,
  canSwitchWorkspace = false,
  activeAgents,
  onOpenThreads,
  onPressThreadTitle,
  onOpenTools,
  onPressMachine,
  onPressWorkspace,
}: ChatScreenHeaderProps) {
  const link = linkMeta(connectionState, macHttpReachable, routeStatusLabel, isDemo);
  const endpoint = machineEndpoint?.trim() || '';
  const showEndpoint =
    endpoint.length > 0 && (!link.connected || showMachineDetailWhenConnected);
  const showWorkspace = canSwitchWorkspace || Boolean(workspaceName);

  return (
    <View style={styles.wrap} testID="chat-screen-header">
      <View style={styles.titleRow}>
        <Pressable
          onPress={onOpenThreads}
          style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
          testID="open-sessions-modal"
          accessibilityLabel="Open threads"
        >
          <Text style={styles.menuIcon}>☰</Text>
        </Pressable>
        <Pressable
          onPress={onPressThreadTitle ?? onOpenThreads}
          style={({ pressed }) => [styles.titlePressable, pressed && styles.pressed]}
          accessibilityLabel={onPressThreadTitle ? 'Rename thread' : 'Open threads'}
          accessibilityHint={onPressThreadTitle ? 'Opens rename' : undefined}
          testID="chat-thread-title"
        >
          <View style={styles.titleTextRow}>
            <Text
              style={styles.threadTitle}
              numberOfLines={1}
              ellipsizeMode="tail"
              testID="HERMES CHAT"
              accessibilityLabel="HERMES CHAT"
            >
              {threadTitle}
            </Text>
            {onPressThreadTitle ? (
              <Pressable
                onPress={(e) => {
                  e?.stopPropagation?.();
                  onPressThreadTitle();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Rename current thread"
                testID="rename-current-thread-header-btn"
                style={styles.renameHeaderBtn}
              >
                <Text style={styles.renameHeaderIcon}>✎</Text>
              </Pressable>
            ) : null}
          </View>
          {threadCreatedLabel ? (
            <Text style={styles.threadCreated} numberOfLines={1} testID="chat-thread-created">
              {threadCreatedLabel}
            </Text>
          ) : null}
        </Pressable>
        <View style={styles.titleActions}>
          {isDemo ? (
            <View style={styles.demoPill}>
              <Text style={styles.demoPillText}>DEMO</Text>
            </View>
          ) : null}
          {onOpenTools ? (
            <Pressable
              onPress={onOpenTools}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              testID="chat-header-tools"
              accessibilityRole="button"
              accessibilityLabel="Open tools"
            >
              <Text style={styles.iconBtnText}>⋯</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={onPressMachine}
        style={({ pressed }) => [styles.macRow, pressed && styles.pressed]}
        testID="chat-context-mac-button"
        accessibilityLabel="Choose your computer"
      >
        <View style={[styles.statusDot, { backgroundColor: link.color }]} />
        <View style={styles.macTextBlock}>
          <Text style={styles.macPrimaryLine} numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.macName} testID="chat-context-mac">
              {machineLabel}
            </Text>
            {showEndpoint ? (
              <Text style={styles.macEndpoint} testID="chat-context-mac-endpoint">
                {' '}
                · {endpoint}
              </Text>
            ) : null}
          </Text>
          <Text
            style={[styles.macStatusLine, { color: link.color }]}
            numberOfLines={2}
            testID="chat-context-link"
          >
            {link.label}
          </Text>
        </View>
      </Pressable>

      {showWorkspace ? (
        <Pressable
          onPress={onPressWorkspace}
          disabled={!canSwitchWorkspace || !onPressWorkspace}
          style={({ pressed }) => [
            styles.workspaceRow,
            canSwitchWorkspace && pressed && styles.pressed,
          ]}
          testID="chat-header-project-picker"
        >
          <Text style={styles.workspaceLabel} numberOfLines={1} testID="chat-context-project">
            {workspaceName ?? 'Choose project'}
            {canSwitchWorkspace ? ' ›' : ''}
          </Text>
          {workspaceHandoff ? (
            <Text style={styles.workspaceHandoff} numberOfLines={1} testID="chat-header-handoff">
              {workspaceHandoff}
            </Text>
          ) : null}
        </Pressable>
      ) : null}

      {activeAgents && activeAgents.length > 0 ? (
        <View style={styles.agentsRow} testID="chat-header-active-agents">
          <Text style={styles.agentsLabel}>
            Active Agents:{' '}
            {activeAgents
              .map((a) => `${a.name} (${a.status})`)
              .join(', ')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 22,
  },
  titlePressable: {
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 2,
    minWidth: 0,
  },
  titleTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  threadTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0,
  },
  threadCreated: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  renameHeaderBtn: {
    flexShrink: 0,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameHeaderIcon: {
    fontSize: 13,
    color: colors.textMuted,
  },
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  demoPill: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  demoPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.backgroundStart,
    letterSpacing: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textSecondary,
    lineHeight: 24,
    marginTop: -4,
  },
  pressed: {
    opacity: 0.72,
  },
  macRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 5,
  },
  macTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  macPrimaryLine: {
    fontSize: 12,
    lineHeight: 16,
  },
  macName: {
    fontWeight: '600',
    color: colors.textMuted,
  },
  macEndpoint: {
    fontWeight: '500',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  macStatusLine: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  workspaceRow: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  workspaceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  workspaceHandoff: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  agentsRow: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  agentsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
