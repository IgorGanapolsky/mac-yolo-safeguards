import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { ToolCallStatus } from '../types/chatDisplay';

type ToolCallCardProps = {
  toolName: string;
  command?: string;
  content?: string;
  status?: ToolCallStatus;
};

export default function ToolCallCard({ toolName, command, content, status = 'completed' }: ToolCallCardProps) {
  const display = (command ?? content ?? toolName).trim();
  const isRunning = status === 'running';
  const isError = status === 'error';

  return (
    <View style={styles.wrapper} testID={`tool-call-${toolName}`}>
      <View style={[styles.terminal, isError && styles.terminalError]}>
        <View style={styles.header}>
          <Text style={styles.headerIcon}>🖥</Text>
          <Text style={styles.headerName} numberOfLines={1}>{toolName}</Text>
          {isRunning ? (
            <ActivityIndicator size="small" color={colors.accent} style={styles.spinner} />
          ) : null}
          {!isRunning && (
            <Text style={[styles.statusPill, isError && styles.statusPillError]}>
              {isError ? 'failed' : 'done'}
            </Text>
          )}
        </View>
        <Text style={styles.command} selectable>
          {display}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginBottom: 12,
  },
  terminal: {
    maxWidth: '92%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.35)',
    backgroundColor: '#0A1018',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  terminalError: {
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  headerIcon: {
    fontSize: 12,
  },
  headerName: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.4,
  },
  spinner: {
    marginLeft: 4,
  },
  statusPill: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  statusPillError: {
    color: colors.error,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  command: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
