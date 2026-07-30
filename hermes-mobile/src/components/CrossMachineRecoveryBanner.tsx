import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { CrossMachineRecoveryOffer } from '../utils/crossMachineRecovery';
import LoadingButton from './ui/LoadingButton';

type CrossMachineRecoveryBannerProps = {
  offer: CrossMachineRecoveryOffer;
  onSwitch: (profileId: string) => void;
  busy?: boolean;
  testID?: string;
};

/**
 * Dead-end breaker: the selected Mac is down, another saved Mac is answering right now.
 * Explicit one tap — never an automatic reroute, because the target machine is where
 * commands would then run.
 */
export default function CrossMachineRecoveryBanner({
  offer,
  onSwitch,
  busy = false,
  testID = 'cross-machine-recovery-banner',
}: CrossMachineRecoveryBannerProps) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.title}>{offer.title}</Text>
      <Text style={styles.body} textBreakStrategy="highQuality">
        {offer.body}
      </Text>
      <LoadingButton
        label={offer.actionLabel}
        loadingLabel="Switching…"
        loading={busy}
        onPress={() => onSwitch(offer.profileId)}
        testID="cross-machine-recovery-switch"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.35)',
    backgroundColor: 'rgba(34, 211, 238, 0.10)',
    padding: 14,
    gap: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
});
