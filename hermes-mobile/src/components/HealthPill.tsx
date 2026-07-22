import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { colors } from '../theme/colors';
import type { GatewayHealthLevel } from '../types/gateway';

const LABELS: Record<GatewayHealthLevel, string> = {
  green: 'Connected',
  amber: 'Needs attention',
  red: "Can't reach your Mac",
  unknown: 'Checking…',
};

const DOT_COLORS: Record<GatewayHealthLevel, string> = {
  green: colors.success,
  amber: colors.warning,
  red: colors.error,
  unknown: colors.textMuted,
};

interface HealthPillProps {
  level: GatewayHealthLevel;
  detail?: string;
}

export default function HealthPill({ level, detail }: HealthPillProps) {
  return (
    <View style={styles.pill} testID="health-pill">
      <View style={styles.labelRow}>
        <View style={[styles.dot, { backgroundColor: DOT_COLORS[level] }]} />
        <Text style={styles.label}>{LABELS[level]}</Text>
      </View>
      {detail ? (
        <Text style={styles.detail} numberOfLines={1} ellipsizeMode="tail">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'stretch',
    flexShrink: 1,
    maxWidth: '100%',
    backgroundColor: colors.cardBg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
    justifyContent: 'center',
    minHeight: 36,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  detail: {
    fontSize: 10,
    color: colors.textMuted,
    marginLeft: 16,
  },
});
