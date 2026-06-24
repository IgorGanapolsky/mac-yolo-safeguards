import React, { memo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { diffStats, formatDiffPreview } from '../utils/diffDisplay';

type DiffPreviewBoxProps = {
  diff: string;
  testID?: string;
};

function DiffPreviewBox({ diff, testID = 'diff-preview-box' }: DiffPreviewBoxProps) {
  const preview = formatDiffPreview(diff);
  const stats = diffStats(diff);

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.title}>Changes on your Mac</Text>
        {stats ? (
          <Text style={styles.stats}>
            +{stats.additions} −{stats.deletions}
          </Text>
        ) : null}
      </View>
      <ScrollView style={styles.scroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <Text style={styles.diffText} selectable>{preview}</Text>
      </ScrollView>
    </View>
  );
}

export default memo(DiffPreviewBox);

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: '#0A1018',
    marginBottom: 10,
    maxHeight: 160,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  stats: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accent,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scroll: {
    maxHeight: 120,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  diffText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
