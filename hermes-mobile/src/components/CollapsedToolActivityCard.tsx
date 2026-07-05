import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import { extractTerminalActivityFromMessage } from '../utils/terminalActivity';
import { parseToolActivityDetails } from '../utils/toolMessageDetails';
import ToolCallCard from './ToolCallCard';
import ToolActivityCard from './ToolActivityCard';
import type { HermesMessage } from '../types/chat';

type CollapsedToolActivityCardProps = {
  activities: HermesMessage[];
  timeLabel: string;
};

export default function CollapsedToolActivityCard({
  activities,
  timeLabel,
}: CollapsedToolActivityCardProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    haptics.selection();
    setExpanded((prev) => !prev);
  };

  const parsedActivities = activities.map((activity, index) => {
    const term = extractTerminalActivityFromMessage(activity);
    if (term) {
      return {
        id: activity.id ?? `term-${index}`,
        icon: '🖥',
        name: term.toolName,
        summary: term.command || term.toolName,
        isTerminal: true,
        activity,
      };
    }
    const details = parseToolActivityDetails(
      activity.gatewayContent ?? activity.rawContent ?? activity.content,
      activity.content,
    );
    return {
      id: activity.id ?? `act-${index}`,
      icon: details?.icon ?? '🔧',
      name: details?.toolName ?? 'tool',
      summary: details?.summaryLine ?? activity.content,
      isTerminal: false,
      activity,
    };
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.header}
          onPress={toggle}
          activeOpacity={0.88}
        >
          <View style={styles.titleRow}>
            <Text style={styles.titleIcon}>🔧</Text>
            <Text style={styles.titleText}>
              Executed {activities.length} tool {activities.length === 1 ? 'action' : 'actions'}
            </Text>
          </View>
          
          {!expanded && (
            <View style={styles.summaryList}>
              {parsedActivities.map((act) => (
                <View key={act.id} style={styles.summaryRow}>
                  <Text style={styles.summaryIcon}>{act.icon}</Text>
                  <Text style={styles.summaryText} numberOfLines={1}>
                    {act.name}: {act.summary.replace(/^\[tool output\]\s*/i, '')}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.toggleText}>
            {expanded ? 'Hide tool outputs ▴' : 'Show tool outputs ▾'}
          </Text>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.expandedContent}>
            {parsedActivities.map((act) => {
              if (act.isTerminal) {
                const term = extractTerminalActivityFromMessage(act.activity);
                if (term) {
                  return (
                    <ToolCallCard
                      key={act.id}
                      toolName={term.toolName}
                      command={term.command}
                      status={term.status}
                    />
                  );
                }
              }
              return (
                <ToolActivityCard
                  key={act.id}
                  gatewayContent={
                    act.activity.gatewayContent ??
                    act.activity.rawContent ??
                    act.activity.content
                  }
                  preview={act.activity.content}
                  timeLabel={timeLabel}
                />
              );
            })}
          </View>
        )}

        <Text style={styles.timeLabel}>{timeLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    width: '100%',
  },
  container: {
    maxWidth: '92%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.24)',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  header: {
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleIcon: {
    fontSize: 16,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  summaryList: {
    paddingLeft: 8,
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(34, 211, 238, 0.3)',
    marginTop: 4,
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryIcon: {
    fontSize: 11,
  },
  summaryText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 4,
  },
  expandedContent: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 8,
    gap: 8,
  },
  timeLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
});
