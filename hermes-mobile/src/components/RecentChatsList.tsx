import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HermesSession } from '../types/chat';
import type { RunProgressState } from '../types/chatDisplay';
import { colors } from '../theme/colors';
import { formatSessionLastActive, sessionLastActiveValue } from '../utils/sessionDisplay';
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
  onClearAll?: () => void;
  onNewChat?: () => void;
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
  if (/^\[IMPORTANT:\s*You are running as a scheduled cron/i.test(raw)) {
    return 'Scheduled cron on your Mac';
  }
  return raw.length > 72 ? `${raw.slice(0, 72)}…` : raw;
}

export default function RecentChatsList({
  sessions,
  currentSessionId,
  sessionLabelFor,
  runProgress,
  isSending = false,
  pendingApprovalSessionIds,
  onSelectSession,
  onClearAll,
  onNewChat,
  maxItems = 5,
  variant = 'compact',
  testID = 'recent-chats-list',
}: RecentChatsListProps) {
  const recentSessions = useMemo(
    () => sortSessionsForAgentRail(sessions).slice(0, maxItems),
    [sessions, maxItems],
  );

  if (recentSessions.length === 0) {
    return null;
  }

  const expanded = variant === 'expanded';

  return (
    <View style={[styles.wrap, expanded && styles.wrapExpanded]} testID={testID}>
      <View style={styles.headerRow}>
        <Text style={[styles.heading, expanded && styles.headingExpanded]}>Recent chats</Text>
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
            <Pressable
              key={session.id}
              onPress={() => onSelectSession(session)}
              style={({ pressed }) => [
                styles.row,
                expanded && styles.rowExpanded,
                active && styles.rowActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Open chat ${sessionLabelFor(session)}`}
              testID={`recent-chat-${session.id}`}
            >
              <View style={styles.rowMain}>
                <View style={styles.titleRow}>
                  <Text
                    style={[styles.title, active && styles.titleActive]}
                    numberOfLines={expanded ? 2 : 1}
                  >
                    {sessionLabelFor(session)}
                  </Text>
                  {badge ? <Text style={styles.badge}>{badge}</Text> : null}
                </View>
                {preview ? (
                  <Text style={styles.preview} numberOfLines={expanded ? 2 : 1}>
                    {preview}
                  </Text>
                ) : null}
              </View>
              {lastActive ? <Text style={styles.time}>{lastActive}</Text> : null}
            </Pressable>
          );
        })}
      </View>
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
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  headingExpanded: {
    fontSize: 13,
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
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowExpanded: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.cardBg,
  },
  rowActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79, 70, 229, 0.14)',
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
    maxWidth: 72,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.82,
  },
});
