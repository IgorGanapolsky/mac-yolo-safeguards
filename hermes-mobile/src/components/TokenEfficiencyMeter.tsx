import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { TokenTelemetry } from '../types/grokBot';

interface TokenEfficiencyMeterProps {
  telemetry: TokenTelemetry;
}

export const TokenEfficiencyMeter: React.FC<TokenEfficiencyMeterProps> = ({
  telemetry,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.statItem}>
        <Text style={styles.statLabel}>TTFT</Text>
        <Text style={[styles.statValue, styles.statValueGreen]}>
          &lt;{telemetry.ttftMs}ms
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.statItem}>
        <Text style={styles.statLabel}>NOISE REDUCTION</Text>
        <Text style={styles.statValue}>
          -{telemetry.noiseReductionPercent}%
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.statItem}>
        <Text style={styles.statLabel}>COMPACTED</Text>
        <Text style={styles.statValue}>
          +{(telemetry.compactedTokensSaved / 1000).toFixed(1)}k
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.statItem}>
        <Text style={styles.statLabel}>SPEND / CAP</Text>
        <Text style={styles.statValue}>
          ${telemetry.monthlySpendUsd.toFixed(2)} / ${telemetry.monthlyCeilingUsd.toFixed(0)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 16,
    marginVertical: 6,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    marginTop: 1,
  },
  statValueGreen: {
    color: '#34D399',
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
});

export default TokenEfficiencyMeter;
