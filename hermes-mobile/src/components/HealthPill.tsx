import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { colors } from '../theme/colors';
import type { GatewayHealthLevel } from '../types/gateway';

const LABELS: Record<GatewayHealthLevel, string> = {
  green: 'Gateway healthy',
  amber: 'Gateway warning',
  red: 'Gateway unreachable',
  unknown: 'Gateway unknown',
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
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: DOT_COLORS[level] }]} />
      <Text style={styles.label}>{LABELS[level]}</Text>
      {detail ? (
        <Text
          style={styles.detail}
          numberOfLines={1}
          ellipsizeMode="tail"
          testID="health-pill-detail"
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.cardBg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    flexShrink: 1,
    minWidth: 0,
    fontSize: 10,
    color: colors.textMuted,
  },
});
