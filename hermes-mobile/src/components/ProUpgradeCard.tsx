import React, { useEffect, useState } from 'react';
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
  HERMES_BETA_LANDING_URL,
  THUMBGATE_LEASH_PRODUCT_NAME,
  THUMBGATE_PRO_PRICE_LABEL,
  THUMBGATE_PRO_URL,
} from '../constants/monetization';
import {
  THUMBGATE_LEASH_IAP_PRODUCT_ID,
  purchaseThumbgateLeash,
  restoreThumbgateLeashPurchases,
  thumbgateIapSubscribeLabel,
} from '../services/thumbgateIap';
import { trackProductEvent } from '../services/productAnalytics';
import { colors } from '../theme/colors';

type ProUpgradeCardProps = {
  onUnlocked?: () => void | Promise<void>;
  /** When true, render CTA buttons only — paywall copy lives in LeashProUpsellBanner. */
  compact?: boolean;
};

export default function ProUpgradeCard({ onUnlocked, compact = false }: ProUpgradeCardProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void trackProductEvent('leash_paywall_view', {
      product_id: THUMBGATE_LEASH_IAP_PRODUCT_ID,
    });
  }, []);

  const openLearnMore = async () => {
    await trackProductEvent('upgrade_tap_thumbgate_learn_more', { url: THUMBGATE_PRO_URL });
    await Linking.openURL(THUMBGATE_PRO_URL);
  };

  const openFoundingBeta = async () => {
    await trackProductEvent('founding_beta_tap', { url: HERMES_BETA_LANDING_URL });
    await Linking.openURL(HERMES_BETA_LANDING_URL);
  };

  const handleSubscribe = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await trackProductEvent('upgrade_tap_thumbgate_iap');
      await trackProductEvent('leash_purchase_start', {
        product_id: THUMBGATE_LEASH_IAP_PRODUCT_ID,
      });
      const result = await purchaseThumbgateLeash();
      await trackProductEvent('leash_purchase_result', {
        product_id: THUMBGATE_LEASH_IAP_PRODUCT_ID,
        status: result.status,
      });
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
      await trackProductEvent('leash_restore_result', {
        product_id: THUMBGATE_LEASH_IAP_PRODUCT_ID,
        status: result.status,
      });
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
      {!compact ? (
        <>
          <Text style={styles.title}>{THUMBGATE_LEASH_PRODUCT_NAME} is your AI agent firewall</Text>
          <Text style={styles.body}>
            Block risky tools before they run, keep editable firewall rules, and save
            repeat decisions as ThumbGate memory. Free Hermes chat stays free.
          </Text>
          <Text style={styles.valueLine}>
            One blocked file wipe, force-push, or bad deploy can cover Pro. {THUMBGATE_PRO_PRICE_LABEL}.
          </Text>
        </>
      ) : null}
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
      <Text style={styles.riskReversal}>
        Cancel anytime in {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} settings.
      </Text>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => void handleRestore()}
        disabled={busy}
        testID="restore-thumbgate-leash"
      >
        <Text style={styles.secondaryButtonText}>Restore purchases</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.betaLinkButton}
        onPress={() => void openFoundingBeta()}
        disabled={busy}
        testID="join-founding-beta"
      >
        <Text style={styles.betaLinkText}>Join founding beta instead</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void openLearnMore()} testID="upgrade-thumbgate-pro">
        <Text style={styles.learnMoreLink}>Learn what ThumbGate Pro includes</Text>
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
  valueLine: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    fontStyle: 'italic',
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
  riskReversal: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    textAlign: 'center',
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
  betaLinkButton: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  betaLinkText: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  learnMoreLink: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
