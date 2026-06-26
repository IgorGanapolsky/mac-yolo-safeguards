import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import { parseToolActivityDetails } from '../utils/toolMessageDetails';

type ToolActivityCardProps = {
  gatewayContent: string;
  preview: string;
  timeLabel: string;
  threadLabel?: string;
  threadDivider?: boolean;
};

export default function ToolActivityCard({
  gatewayContent,
  preview,
  timeLabel,
  threadLabel,
  threadDivider = false,
}: ToolActivityCardProps) {
  const [expanded, setExpanded] = useState(false);
  const details = useMemo(
    () => parseToolActivityDetails(gatewayContent, preview),
    [gatewayContent, preview],
  );

  if (!details) {
    return null;
  }

  const toggle = () => {
    haptics.selection();
    setExpanded((value) => !value);
  };

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.card}
        onPress={toggle}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${details.toolName} tool activity. ${expanded ? 'Collapse' : 'Expand'} details.`}
        testID={`tool-activity-${details.toolName}`}
      >
        {threadLabel ? (
          <Text style={[styles.threadLabel, threadDivider && styles.threadLabelDivider]}>
            {threadLabel}
          </Text>
        ) : null}

        <View style={styles.headerRow}>
          <Text style={styles.icon}>{details.icon}</Text>
          <Text style={styles.summary} numberOfLines={expanded ? undefined : 2}>
            {details.summaryLine}
          </Text>
        </View>

        <Text style={styles.hint}>{expanded ? 'Hide geek details ▴' : 'Geek details ▾'}</Text>

        {expanded ? (
          <ScrollView
            style={styles.detailsScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {details.detailRows.map((row) => (
              <View key={row.label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{row.label}</Text>
                <Text style={styles.detailValue} selectable>
                  {row.value}
                </Text>
              </View>
            ))}
            <Text style={styles.detailLabel}>RAW PAYLOAD</Text>
            <Text style={styles.rawPayload} selectable>
              {details.formattedPayload}
            </Text>
          </ScrollView>
        ) : null}

        <Text style={styles.timeLabel} testID="chat-message-timestamp">
          {timeLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  card: {
    maxWidth: '92%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    gap: 8,
  },
  threadLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  threadLabelDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.2)',
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  icon: {
    fontSize: 16,
    marginTop: 1,
  },
  summary: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hint: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.2,
  },
  detailsScroll: {
    maxHeight: 280,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.15)',
    paddingTop: 8,
  },
  detailRow: {
    marginBottom: 10,
    gap: 3,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  rawPayload: {
    fontSize: 10,
    lineHeight: 15,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 4,
  },
  timeLabel: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.textMuted,
  },
});
