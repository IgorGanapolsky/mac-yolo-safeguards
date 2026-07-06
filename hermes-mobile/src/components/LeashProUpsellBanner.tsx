import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ProUpgradeCard from './ProUpgradeCard';
import {
  getLeashFreeTierLearnMoreSections,
  getLeashFreeTierPaywallCopy,
} from '../utils/leashUx';
import { colors } from '../theme/colors';

type LeashProUpsellBannerProps = {
  onUnlocked?: () => void | Promise<void>;
};

export default function LeashProUpsellBanner({
  onUnlocked,
}: LeashProUpsellBannerProps) {
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const paywall = getLeashFreeTierPaywallCopy();
  const learnMoreSections = getLeashFreeTierLearnMoreSections();

  return (
    <View style={styles.wrap} testID="gate-rules-pro-upsell">
      <Text style={styles.headline} testID="leash-paywall-headline">
        {paywall.headline}
      </Text>
      <Text style={styles.outcome}>{paywall.outcome}</Text>
      <View style={styles.bulletList} testID="leash-paywall-bullets">
        {paywall.bullets.map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <Text style={styles.bulletMarker}>•</Text>
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.positioning}>{paywall.positioningLine}</Text>
      <ProUpgradeCard compact onUnlocked={onUnlocked} />
      <TouchableOpacity
        onPress={() => setLearnMoreOpen((open) => !open)}
        testID="leash-paywall-learn-more-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: learnMoreOpen }}
      >
        <Text style={styles.learnMoreToggle}>
          {learnMoreOpen ? 'Hide included controls' : 'See included controls'}
        </Text>
      </TouchableOpacity>
      {learnMoreOpen ? (
        <View style={styles.learnMoreBody} testID="leash-paywall-learn-more">
          {learnMoreSections.map((section) => (
            <View key={section.title} style={styles.learnMoreSection}>
              <Text style={styles.learnMoreTitle}>{section.title}</Text>
              <Text style={styles.learnMoreText}>{section.body}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  headline: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    lineHeight: 26,
  },
  outcome: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  bulletList: {
    gap: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletMarker: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.primary,
    fontWeight: '800',
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
    fontWeight: '600',
  },
  positioning: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  learnMoreToggle: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  learnMoreBody: {
    gap: 10,
    paddingTop: 4,
  },
  learnMoreSection: {
    gap: 4,
  },
  learnMoreTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  learnMoreText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
});
