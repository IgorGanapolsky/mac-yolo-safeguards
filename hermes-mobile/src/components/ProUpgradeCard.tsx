import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  THUMBGATE_LEASH_PRODUCT_NAME,
  THUMBGATE_PRO_PRICE_LABEL,
  THUMBGATE_PRO_URL,
} from '../constants/monetization';
import {
  purchaseThumbgateLeash,
  restoreThumbgateLeashPurchases,
  thumbgateIapSubscribeLabel,
} from '../services/thumbgateIap';
import { trackProductEvent } from '../services/productAnalytics';
import { colors } from '../theme/colors';

type ProUpgradeCardProps = {
  onUnlocked?: () => void | Promise<void>;
  /** Dev / internal QA only — never shown in production store builds. */
  onTesterUnlock?: () => void | Promise<void>;
};

export default function ProUpgradeCard({ onUnlocked, onTesterUnlock }: ProUpgradeCardProps) {
  const [busy, setBusy] = useState(false);

  const openLearnMore = async () => {
    await trackProductEvent('upgrade_tap_thumbgate_learn_more', { url: THUMBGATE_PRO_URL });
    await Linking.openURL(THUMBGATE_PRO_URL);
  };

  const handleSubscribe = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await trackProductEvent('upgrade_tap_thumbgate_iap');
      const result = await purchaseThumbgateLeash();
      if (result.status === 'purchased') {
        await onUnlocked?.();
        return;
      }
      if (result.status === 'cancelled') {
        return;
      }
      Alert.alert(
        'In-app purchase',
        result.status === 'not_configured' || result.status === 'error'
          ? result.message
          : 'Could not complete purchase.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await trackProductEvent('upgrade_tap_thumbgate_restore');
      const result = await restoreThumbgateLeashPurchases();
      if (result.status === 'purchased') {
        await onUnlocked?.();
        return;
      }
      Alert.alert(
        'Restore purchases',
        result.status === 'not_configured' || result.status === 'error'
          ? result.message
          : 'No active ThumbGate Leash subscription found.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap} testID="pro-upgrade-card">
      <Text style={styles.title}>ThumbGate Pro</Text>
      <Text style={styles.body}>
        Hermes Chat is free. {THUMBGATE_LEASH_PRODUCT_NAME} ({THUMBGATE_PRO_PRICE_LABEL}) unlocks
        mobile approval cards and ThumbGate memory gates — billed through{' '}
        {Platform.OS === 'ios' ? 'the App Store' : 'Google Play'}, not on thumbgate.ai.
      </Text>
      <TouchableOpacity
        style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
        onPress={() => void handleSubscribe()}
        disabled={busy}
        testID="subscribe-thumbgate-leash-iap"
      >
        <Text style={styles.primaryButtonText}>
          {busy ? 'Connecting to store…' : thumbgateIapSubscribeLabel()}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => void handleRestore()}
        disabled={busy}
        testID="restore-thumbgate-leash"
      >
        <Text style={styles.secondaryButtonText}>Restore purchases</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void openLearnMore()} testID="upgrade-thumbgate-pro">
        <Text style={styles.learnMoreLink}>Learn what ThumbGate Pro includes</Text>
      </TouchableOpacity>
      {onTesterUnlock ? (
        <TouchableOpacity
          style={styles.testerButton}
          onPress={() => {
            void trackProductEvent('thumbgate_leash_tester_unlock_tap');
            void onTesterUnlock();
          }}
          testID="unlock-thumbgate-leash"
        >
          <Text style={styles.testerButtonText}>
            Unlock for testing (dev builds only)
          </Text>
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
  primaryButtonDisabled: {
    opacity: 0.7,
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
  learnMoreLink: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  testerButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  testerButtonText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
