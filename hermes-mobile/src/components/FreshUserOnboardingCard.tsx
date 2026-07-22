import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import {
  freshUserOnboardingHeading,
  freshUserOnboardingSteps,
  isFreshUserUnpaired,
  isOnTailscaleRoute,
  type FreshUserOnboardingStep,
} from '../utils/freshUserOnboarding';
import type { GatewayProfile } from '../types/gatewayProfile';

type FreshUserOnboardingCardProps = {
  profiles: GatewayProfile[];
  activeProfileId?: string | null;
  tailscaleMacLabel?: string;
  wifiConnected?: boolean;
  /** When true, keep the card mounted (Maestro testID) but hide numbered steps during discovery. */
  hideSteps?: boolean;
  testID?: string;
};

export default function FreshUserOnboardingCard({
  profiles,
  activeProfileId = null,
  tailscaleMacLabel,
  wifiConnected = true,
  hideSteps = false,
  testID = 'fresh-user-onboarding-card',
}: FreshUserOnboardingCardProps) {
  const freshUser = isFreshUserUnpaired(profiles);
  const onTailscaleRoute = isOnTailscaleRoute(profiles, activeProfileId);
  const heading = freshUserOnboardingHeading(freshUser);
  const steps = freshUserOnboardingSteps({
    tailscaleMacLabel,
    wifiConnected,
    onTailscaleRoute,
  });

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.heading} testID="fresh-user-onboarding-heading">
        {heading}
      </Text>
      {hideSteps
        ? null
        : steps.map((item) => <OnboardingStepRow key={item.step} item={item} />)}
    </View>
  );
}

function OnboardingStepRow({ item }: { item: FreshUserOnboardingStep }) {
  return (
    <View style={styles.stepRow} testID={`fresh-user-step-${item.step}`}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{item.step}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{item.title}</Text>
        <Text style={styles.stepText}>{item.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  heading: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 211, 238, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.accent,
  },
  stepBody: {
    flex: 1,
    gap: 3,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  stepText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
});
