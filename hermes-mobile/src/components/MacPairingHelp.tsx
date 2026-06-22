import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import {
  HERMES_MAC_GET_STARTED_URL,
  type MacPairingHelpVariant,
  macPairingHeadingForVariant,
  macPairingStepsForVariant,
} from '../utils/macPairingUx';

type MacPairingHelpProps = {
  variant?: MacPairingHelpVariant;
  compact?: boolean;
  testID?: string;
};

export default function MacPairingHelp({
  variant = 'getting-started',
  compact = false,
  testID,
}: MacPairingHelpProps) {
  const steps = macPairingStepsForVariant(variant, compact);
  const heading = macPairingHeadingForVariant(variant);
  const showInstallLink = variant === 'getting-started' && !compact;

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.heading}>{heading}</Text>
      {steps.map((item) => (
        <View key={item.step} style={styles.stepRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>{item.step}</Text>
          </View>
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>{item.title}</Text>
            <Text style={styles.stepText}>{item.body}</Text>
          </View>
        </View>
      ))}
      {showInstallLink ? (
        <TouchableOpacity
          onPress={() => Linking.openURL(HERMES_MAC_GET_STARTED_URL)}
          accessibilityRole="link"
          testID="mac-pairing-install-link"
        >
          <Text style={styles.installLink}>Learn how to install Hermes on your Mac →</Text>
        </TouchableOpacity>
      ) : null}
      {!compact && variant === 'qr-pairing' ? (
        <Text style={styles.note}>
          Each Mac has its own QR. Scan once per Mac — the app remembers each machine you pair.
        </Text>
      ) : null}
      {!compact && variant === 'getting-started' ? (
        <Text style={styles.note}>
          Already have Hermes running? Skip install and tap Search for my Mac. Use Scan QR only if
          Hermes shows you a pairing code on the Mac screen.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  heading: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.2,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.accent,
  },
  stepBody: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  stepText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  installLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 2,
  },
  note: {
    fontSize: 10,
    lineHeight: 15,
    color: colors.textMuted,
    marginTop: 2,
  },
});
