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
          <Text style={styles.title}>SECURE YOUR WORKSPACE</Text>
          <Text style={styles.hypnoticText}>
            Imagine your AI agent running wild on your computer—reading private SSH keys, force-pushing broken code, or wiping your primary codebase while you sleep.
          </Text>
          <Text style={styles.body}>
            No corporate fluff here. If you run agent loops on your primary machine, you are unprotected. Standard chat is a sandbox. Pro is your active firewall.
          </Text>
          <Text style={styles.warningText}>
            Warning: This is not a toy. If you write simple scripts, stick to the free tier. This is a weapon for developers who value their workspace security.
          </Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bulletTitle}>• Real-Time Firewalls</Text>
            <Text style={styles.bulletBody}>Pause and inspect risky command executions on your phone before they run.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bulletTitle}>• ThumbGate Rule Engine</Text>
            <Text style={styles.bulletBody}>Auto-learn allowed/blocked rules from 👍/👎 actions so it stops asking twice.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bulletTitle}>• OpenClaw Relays</Text>
            <Text style={styles.bulletBody}>Deploy enterprise-grade permission gates to secure your whole setup.</Text>
          </View>
        </>
      ) : null}
      <TouchableOpacity
        style={styles.foundingBetaButton}
        onPress={() => void openFoundingBeta()}
        disabled={busy}
        testID="join-founding-beta"
      >
        <Text style={styles.foundingBetaButtonText}>Join founding beta</Text>
      </TouchableOpacity>
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
  foundingBetaButton: {
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  foundingBetaButtonText: {
    color: '#052e16',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  learnMoreLink: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  hypnoticText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.warning,
    fontWeight: '700',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    marginVertical: 4,
  },
  bulletRow: {
    marginVertical: 4,
    paddingLeft: 4,
  },
  bulletTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  bulletBody: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    marginTop: 2,
  },
});
