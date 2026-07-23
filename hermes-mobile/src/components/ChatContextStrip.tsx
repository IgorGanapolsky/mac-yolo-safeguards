import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';
import { resolveChatLinkDisplay } from '../utils/gatewayConnection';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';

type ChatContextStripProps = {
  machineLabel: string;
  connectionState: LeashConnectionState;
  macHttpReachable?: boolean;
  authMismatch?: boolean;
  projectName?: string;
  workspacePath?: string;
  handoffSummary?: string;
  onPressMac?: () => void;
  onPressProject?: () => void;
  macSwitchHint?: string;
  channelHint?: string;
};

function connectionMeta(
  state: LeashConnectionState,
  macHttpReachable = false,
  authMismatch = false,
): { label: string; color: string } {
  const link = resolveChatLinkDisplay({
    connectionState: state,
    macHttpOk: macHttpReachable,
    authMismatch,
  });
  if (link.chatReachable) {
    return { label: 'Linked', color: colors.success };
  }
  if (link.label === GATEWAY_AUTH_REPAIR_HEADER) {
    return { label: link.label, color: colors.error };
  }
  if (link.label === 'Needs computer link' || link.label === 'Relay only') {
    return { label: 'Needs computer link', color: colors.warning };
  }
  if (state === 'connecting') {
    return { label: 'Connecting…', color: colors.warning };
  }
  return { label: 'Not linked', color: colors.error };
}

export default function ChatContextStrip({
  machineLabel,
  connectionState,
  macHttpReachable = false,
  authMismatch = false,
  projectName,
  workspacePath,
  handoffSummary,
  onPressMac,
  onPressProject,
  macSwitchHint,
  channelHint,
}: ChatContextStripProps) {
  const status = connectionMeta(connectionState, macHttpReachable, authMismatch);

  return (
    <View style={styles.strip} testID="chat-context-strip">
      <Pressable
        onPress={onPressMac}
        disabled={!onPressMac}
        style={({ pressed }) => [
          styles.macPressable,
          onPressMac && pressed && styles.macPressablePressed,
        ]}
        accessibilityRole={onPressMac ? 'button' : undefined}
        accessibilityLabel={onPressMac ? `Choose your computer — ${machineLabel}` : undefined}
        accessibilityHint={macSwitchHint}
        testID="chat-context-mac-button"
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <View style={styles.macRow}>
          <Text style={styles.rowIcon}>🖥</Text>
          <Text style={styles.macLabel} numberOfLines={2} ellipsizeMode="tail" testID="chat-context-mac">
            {machineLabel}
          </Text>
          {onPressMac ? <Text style={styles.switchChevron}>▾</Text> : null}
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <Text style={[styles.statusText, { color: status.color }]} testID="chat-context-link">
            {status.label}
          </Text>
        </View>
        {macSwitchHint ? (
          <Text style={styles.macHint} testID="chat-context-mac-hint">{macSwitchHint}</Text>
        ) : null}
      </Pressable>
      <Pressable
        onPress={onPressProject ?? undefined}
        disabled={!onPressProject}
        style={({ pressed }) => [
          styles.row,
          onPressProject && styles.projectPressable,
          onPressProject && pressed && styles.projectPressablePressed,
        ]}
        accessibilityRole={onPressProject ? 'button' : undefined}
        accessibilityLabel={onPressProject ? 'Choose project' : undefined}
        testID="chat-context-project-row"
      >
        <Text style={styles.rowIcon}>📁</Text>
        {projectName ? (
          <Text style={styles.projectLine} numberOfLines={3} ellipsizeMode="tail" testID="chat-context-project">
            <Text style={styles.projectName}>{projectName}</Text>
            {workspacePath ? (
              <Text style={styles.workspacePath}> · {workspacePath}</Text>
            ) : null}
          </Text>
        ) : (
          <Text style={styles.projectHint} testID="chat-context-project">
            {channelHint ?? 'No project pinned — Hermes uses the computer default workspace'}
          </Text>
        )}
        {onPressProject ? <Text style={styles.switchChevron}>▾</Text> : null}
      </Pressable>
      {handoffSummary ? (
        <Text style={styles.handoffLine} numberOfLines={2} testID="chat-context-handoff">
          ↪ {handoffSummary}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macPressable: {
    borderRadius: 8,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  macPressablePressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  macRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchChevron: {
    color: colors.textMuted,
    fontSize: 11,
    marginLeft: -2,
  },
  macHint: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    paddingLeft: 22,
  },
  rowIcon: {
    fontSize: 12,
    width: 18,
  },
  macLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  projectLine: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  projectName: {
    fontWeight: '800',
    color: colors.accent,
  },
  workspacePath: {
    fontWeight: '500',
    color: colors.textMuted,
  },
  projectHint: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  projectPressable: {
    borderRadius: 8,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  projectPressablePressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  handoffLine: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
    paddingLeft: 22,
  },
});
