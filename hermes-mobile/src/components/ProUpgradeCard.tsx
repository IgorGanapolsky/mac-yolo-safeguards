import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  HERMES_HARDENING_SPRINT_URL,
  THUMBGATE_PRO_PRICE_LABEL,
  THUMBGATE_PRO_URL,
} from '../constants/monetization';
import { trackProductEvent } from '../services/productAnalytics';
import { colors } from '../theme/colors';

export default function ProUpgradeCard() {
  const openUrl = async (url: string, event: string) => {
    await trackProductEvent(event, { url });
    await Linking.openURL(url);
  };

  return (
    <View style={styles.wrap} testID="pro-upgrade-card">
      <Text style={styles.title}>ThumbGate Pro</Text>
      <Text style={styles.body}>
        Hermes Mobile is free. ThumbGate Pro ({THUMBGATE_PRO_PRICE_LABEL}) blocks repeat agent
        mistakes across every tool call — the paid layer behind Leash memory gates.
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => openUrl(THUMBGATE_PRO_URL, 'upgrade_tap_thumbgate_pro')}
        testID="upgrade-thumbgate-pro"
      >
        <Text style={styles.primaryButtonText}>Upgrade on thumbgate.ai</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => openUrl(HERMES_HARDENING_SPRINT_URL, 'upgrade_tap_hardening_sprint')}
        testID="upgrade-hardening-sprint"
      >
        <Text style={styles.secondaryButtonText}>Team hardening sprint ($1,500)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
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
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
});
