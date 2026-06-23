import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  THUMBGATE_LEASH_TAB_LABEL,
  THUMBGATE_PRO_PRICE_LABEL,
  THUMBGATE_PRO_URL,
} from '../constants/monetization';
import { trackProductEvent } from '../services/productAnalytics';
import { colors } from '../theme/colors';

type ProUpgradeCardProps = {
  onUnlock?: () => void | Promise<void>;
};

export default function ProUpgradeCard({ onUnlock }: ProUpgradeCardProps) {
  const openUrl = async (url: string, event: string) => {
    await trackProductEvent(event, { url });
    await Linking.openURL(url);
  };

  return (
    <View style={styles.wrap} testID="pro-upgrade-card">
      <Text style={styles.title}>ThumbGate Pro</Text>
      <Text style={styles.body}>
        Hermes Chat is free on your phone. {THUMBGATE_LEASH_TAB_LABEL} ({THUMBGATE_PRO_PRICE_LABEL})
        is the paid add-on — approve blocked agent tools from your phone and sync ThumbGate memory
        gates across every tool call.
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => openUrl(THUMBGATE_PRO_URL, 'upgrade_tap_thumbgate_pro')}
        testID="upgrade-thumbgate-pro"
      >
        <Text style={styles.primaryButtonText}>Subscribe on thumbgate.ai</Text>
      </TouchableOpacity>
      {onUnlock ? (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            void trackProductEvent('thumbgate_leash_unlock_tap');
            void onUnlock();
          }}
          testID="unlock-thumbgate-leash"
        >
          <Text style={styles.secondaryButtonText}>I've subscribed — unlock {THUMBGATE_LEASH_TAB_LABEL}</Text>
        </TouchableOpacity>
      ) : null}
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
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  secondaryButtonText: {
    color: colors.secondary,
    fontWeight: '700',
    fontSize: 13,
  },
});
