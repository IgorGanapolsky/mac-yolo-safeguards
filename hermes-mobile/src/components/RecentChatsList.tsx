import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HermesSession } from '../types/chat';
import type { RunProgressState } from '../types/chatDisplay';
import { colors } from '../theme/colors';
import {
  formatSessionLastActive,
  isCronBoilerplateText,
  RECENTS_PREVIEW_MAX_CHARS,
  sessionLastActiveValue,
} from '../utils/sessionDisplay';
import ExpandableThreadTitle from './ExpandableThreadTitle';
import {
  sortSessionsForAgentRail,
  threadActivityForSession,
  threadActivityLabel,
} from '../utils/threadActivity';

type RecentChatsListProps = {
  sessions: HermesSession[];
  currentSessionId?: string | null;
  sessionLabelFor: (session: HermesSession) => string;
  runProgress?: RunProgressState | null;
  isSending?: boolean;
  pendingApprovalSessionIds?: Set<string>;
  onSelectSession: (session: HermesSession) => void;
  onDeleteSession?: (sessionId: string) => void;
  onRenameSession?: (sessionId: string, currentTitle: string) => void;
  onClearAll?: () => void;
  onNewChat?: () => void;
  /** When true, show header actions even if every session is filtered out of the rail (e.g. cron-only). */
  showActionsWhenEmpty?: boolean;
  maxItems?: number;
  variant?: 'compact' | 'expanded';
  testID?: string;
};

function previewSnippet(session: HermesSession, activityPreview: string | null): string | null {
  const raw = activityPreview?.trim() || session.preview?.trim();
  if (!raw) {
    return null;
  }
  if (/^reply\s+with\s+exactly/i.test(raw)) {
    return null;
  }
  if (isCronBoilerplateText(raw)) {
    return 'Scheduled cron on your computer';
  }
  return raw.length > RECENTS_PREVIEW_MAX_CHARS
    ? `${raw.slice(0, RECENTS_PREVIEW_MAX_CHARS)}…`
    : raw;
}

export default function RecentChatsList({
  sessions,
  currentSessionId,
  sessionLabelFor,
  runProgress,
  isSending = false,
  pendingApprovalSessionIds,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onClearAll,
  onNewChat,
  showActionsWhenEmpty = false,
  maxItems = 5,
  variant = 'compact',
  testID = 'recent-chats-list',
}: RecentChatsListProps) {
  const recentSessions = useMemo(
    () => sortSessionsForAgentRail(sessions).slice(0, maxItems),
    [sessions, maxItems],
  );

  const hasHeaderActions = Boolean(onNewChat || onClearAll);
  if (recentSessions.length === 0 && !(showActionsWhenEmpty && hasHeaderActions)) {
    return null;
  }

  const expanded = variant === 'expanded';

  return (
    <View style={[styles.wrap, expanded && styles.wrapExpanded]} testID={testID}>
      <View style={styles.headerRow}>
        <Text style={[styles.heading, expanded && styles.headingExpanded]}>Recents</Text>
        {onNewChat || onClearAll ? (
          <View style={styles.headerActions}>
            {onNewChat ? (
              <Pressable
                onPress={onNewChat}
                style={({ pressed }) => [styles.headerActionBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Start new chat"
                testID="recent-chats-new-chat"
              >
                <Text style={styles.headerActionText}>New chat</Text>
              </Pressable>
            ) : null}
            {onClearAll ? (
              <Pressable
                onPress={onClearAll}
                style={({ pressed }) => [styles.headerActionBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Clear all chats"
                testID="recent-chats-clear-all"
              >
                <Text style={styles.headerActionTextDestructive}>Clear all</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {recentSessions.length > 0 ? (
      <View style={styles.list}>
        {recentSessions.map((session) => {
          const activity = threadActivityForSession(session, {
            currentSessionId,
            isSending,
            runProgress,
            pendingApprovalSessionIds,
          });
          const badge = threadActivityLabel(activity.state);
          const active = session.id === currentSessionId;
          const lastActive = formatSessionLastActive(sessionLastActiveValue(session));
          const preview = previewSnippet(session, activity.preview);

          return (
            <View
              key={session.id}
              style={[
                styles.row,
                expanded && styles.rowExpanded,
                active && styles.rowActive,
              ]}
            >
              <Pressable
                onPress={() => onSelectSession(session)}
                style={({ pressed }) => [
                  styles.rowTap,
                  expanded && styles.rowExpandedTap,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open chat ${sessionLabelFor(session)}`}
                testID={`recent-chat-${session.id}`}
              >
                <View style={styles.rowMain}>
                  <View style={styles.titleRow}>
                    <ExpandableThreadTitle
                      title={sessionLabelFor(session)}
                      collapsedLines={2}
                      style={[styles.title, active && styles.titleActive]}
                      testID={`recent-chat-title-${session.id}`}
                    />
                    {badge ? <Text style={styles.badge}>{badge}</Text> : null}
                  </View>
                  {preview ? (
                    <Text
                      style={styles.preview}
                      numberOfLines={expanded ? 3 : 2}
                      ellipsizeMode="tail"
                    >
                      {preview}
                    </Text>
                  ) : null}
                </View>
                {lastActive ? <Text style={styles.time}>{lastActive}</Text> : null}
              </Pressable>
              {onRenameSession && session.id !== '__telegram_inbox__' ? (
                <Pressable
                  onPress={() => onRenameSession(session.id, sessionLabelFor(session))}
                  style={({ pressed }) => [styles.renameBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Rename thread ${sessionLabelFor(session)}`}
                  testID={`recent-chat-rename-${session.id}`}
                >
                  <Text style={styles.renameBtnText}>✎</Text>
                </Pressable>
              ) : null}
              {onDeleteSession && session.id !== '__telegram_inbox__' ? (
                <Pressable
                  onPress={() => onDeleteSession(session.id)}
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete thread ${sessionLabelFor(session)}`}
                  testID={`recent-chat-delete-${session.id}`}
                >
                  <Text style={styles.deleteBtnText}>🗑</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  wrapExpanded: {
    gap: 10,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  headingExpanded: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActionBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  headerActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  headerActionTextDestructive: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.error,
  },
  list: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingRight: 4,
  },
  rowTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowExpanded: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  rowExpandedTap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  title: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  titleActive: {
    color: colors.text,
  },
  badge: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.warning,
  },
  preview: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  time: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 2,
    maxWidth: 88,
    flexShrink: 0,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.82,
  },
  deleteBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginTop: -2,
  },
  deleteBtnText: {
    fontSize: 14,
    color: colors.error,
  },
  renameBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginTop: -2,
  },
  renameBtnText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
