import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import {
  formatLanScanResultDetail,
  formatLanScanResultLabel,
  formatLanScanStageLabel,
  lanScanFraction,
} from '../utils/lanScanLabels';
import { colors } from '../theme/colors';

type MacScanProgressCardProps = {
  scanning: boolean;
  progress: LanScanProgress | null;
  result: LanScanResult | null;
  connectableProfileCount?: number;
  testID?: string;
};

const RESULT_TTL_MS = 12000;

export default function MacScanProgressCard({
  scanning,
  progress,
  result,
  connectableProfileCount,
  testID = 'mac-scan-progress',
}: MacScanProgressCardProps) {
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (!result || scanning) {
      setShowResult(false);
      return;
    }
    setShowResult(true);
    const timer = setTimeout(() => setShowResult(false), RESULT_TTL_MS);
    return () => clearTimeout(timer);
  }, [result, scanning]);

  if (scanning && progress) {
    const fraction = lanScanFraction(progress);
    const displayProgress =
      connectableProfileCount === undefined
        ? progress
        : { ...progress, foundCount: Math.min(progress.foundCount, connectableProfileCount) };
    return (
      <View style={styles.card} testID={testID}>
        <View style={styles.row}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.statusText}>{formatLanScanStageLabel(displayProgress)}</Text>
        </View>
        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}>
          <View style={[styles.fill, { width: `${Math.max(4, Math.round(fraction * 100))}%` }]} />
        </View>
        <Text style={styles.hint}>
          This can take up to a minute on large Wi‑Fi networks. Keep Hermes open on your computer.
        </Text>
      </View>
    );
  }

  if (scanning) {
    return (
      <View style={styles.card} testID={testID}>
        <View style={styles.row}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.statusText}>Starting Wi‑Fi search…</Text>
        </View>
      </View>
    );
  }

  if (showResult && result) {
    const success = result.foundCount > 0;
    return (
      <View
        style={[styles.card, success ? styles.cardSuccess : styles.cardWarn]}
        testID={`${testID}-result`}
      >
        <Text style={[styles.resultTitle, success ? styles.resultSuccess : styles.resultWarn]}>
          {formatLanScanResultLabel(result)}
        </Text>
        <Text style={styles.resultDetail}>{formatLanScanResultDetail(result)}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    gap: 8,
  },
  cardSuccess: {
    borderColor: 'rgba(16, 185, 129, 0.35)',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  cardWarn: {
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
    lineHeight: 18,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  hint: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  resultSuccess: {
    color: colors.success,
  },
  resultWarn: {
    color: colors.warning,
  },
  resultDetail: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
});
