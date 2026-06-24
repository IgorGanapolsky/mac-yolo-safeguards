import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';

type ChatScreenHeaderProps = {
  threadTitle: string;
  machineLabel: string;
  machineEndpoint?: string;
  connectionState: LeashConnectionState;
  macHttpReachable?: boolean;
  isDemo?: boolean;
  workspaceName?: string;
  canSwitchWorkspace?: boolean;
  onOpenThreads: () => void;
  onPressMachine: () => void;
  onPressWorkspace?: () => void;
};

function linkMeta(
  state: LeashConnectionState,
  macHttpReachable = false,
): { label: string; color: string } {
  if (state === 'connected') {
    return { label: 'Connected', color: colors.success };
  }
  if (state === 'demo') {
    return { label: 'Demo', color: colors.accent };
  }
  if (macHttpReachable) {
    return { label: 'Connected', color: colors.success };
  }
  if (state === 'connecting') {
    return { label: 'Connecting', color: colors.warning };
  }
  return { label: 'Not connected', color: colors.error };
}

/**
 * Conversation-first header: thread title, Mac link line, optional workspace.
 */
export default function ChatScreenHeader({
  threadTitle,
  machineLabel,
  machineEndpoint,
  connectionState,
  macHttpReachable = false,
  isDemo = false,
  workspaceName,
  canSwitchWorkspace = false,
  onOpenThreads,
  onPressMachine,
  onPressWorkspace,
}: ChatScreenHeaderProps) {
  const link = linkMeta(connectionState, macHttpReachable);
  const endpoint = machineEndpoint?.trim() || '';

  return (
    <View style={styles.wrap} testID="chat-screen-header">
      <View style={styles.titleRow}>
        <Pressable
          onPress={onOpenThreads}
          style={({ pressed }) => [styles.titlePressable, pressed && styles.pressed]}
          testID="open-sessions-modal"
          accessibilityLabel="Open threads"
        >
          <Text style={styles.threadTitle} numberOfLines={1} testID="HERMES CHAT">
            {threadTitle}
          </Text>
          <Text style={styles.titleChevron}>›</Text>
        </Pressable>
        {isDemo ? (
          <View style={styles.demoPill}>
            <Text style={styles.demoPillText}>DEMO</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={onPressMachine}
        style={({ pressed }) => [styles.macRow, pressed && styles.pressed]}
        testID="chat-context-mac-button"
        accessibilityLabel="Switch computer"
      >
        <View style={[styles.statusDot, { backgroundColor: link.color }]} />
        <Text style={styles.macLine} numberOfLines={1}>
          <Text style={styles.macName} testID="chat-context-mac">{machineLabel}</Text>
          {endpoint ? (
            <Text style={styles.macEndpoint} testID="chat-context-mac-endpoint">
              {' '}
              · {endpoint}
            </Text>
          ) : null}
          <Text style={[styles.macStatus, { color: link.color }]} testID="chat-context-link">
            {' '}
            · {link.label}
          </Text>
        </Text>
      </Pressable>

      {workspaceName ? (
        <Pressable
          onPress={onPressWorkspace}
          disabled={!canSwitchWorkspace || !onPressWorkspace}
          style={({ pressed }) => [
            styles.workspaceRow,
            canSwitchWorkspace && pressed && styles.pressed,
          ]}
        >
          <Text style={styles.workspaceLabel} numberOfLines={1} testID="chat-context-project">
            Workspace · {workspaceName}
            {canSwitchWorkspace ? ' ›' : ''}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titlePressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
  },
  threadTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0,
  },
  titleChevron: {
    fontSize: 20,
    fontWeight: '300',
    color: colors.textMuted,
    marginTop: 1,
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
  pressed: {
    opacity: 0.82,
  },
  macRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macLine: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  macName: {
    fontWeight: '700',
    color: colors.textSecondary,
  },
  macEndpoint: {
    fontWeight: '500',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  macStatus: {
    fontWeight: '800',
  },
  workspaceRow: {
    paddingVertical: 2,
  },
  workspaceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
