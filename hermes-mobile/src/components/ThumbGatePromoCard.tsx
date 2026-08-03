import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlassCard from './GlassCard';
import { trackProductEvent } from '../services/productAnalytics';
import { colors } from '../theme/colors';
import {
  thumbGatePromoCopy,
  type ThumbGatePromoSurface,
} from '../utils/thumbgatePromoCopy';
import {
  HERMES_MOBILE_CONNECT_SKILL_INSTALL_COMMAND,
  THUMBGATE_CONNECTOR_INSTALL_COMMAND,
  THUMBGATE_CONNECTOR_INSTALL_SHARED_LABEL,
  THUMBGATE_SHARE_SCOPE_NOTE,
  thumbGateFacilitationSteps,
} from '../utils/thumbgateFacilitation';

type ThumbGatePromoCardProps = {
  surface: ThumbGatePromoSurface;
  style?: object;
};

const OPEN_FAIL_TITLE = 'Could not open ThumbGate.app';
const OPEN_FAIL_MESSAGE =
  'Open https://thumbgate.app/dashboard in your browser to continue.';
const SHARE_FAIL_TITLE = 'Could not share install command';
const SHARE_FAIL_MESSAGE =
  'Copy this into Terminal on your Mac:\n\n' + THUMBGATE_CONNECTOR_INSTALL_COMMAND;

export default function ThumbGatePromoCard({ surface, style }: ThumbGatePromoCardProps) {
  const copy = thumbGatePromoCopy(surface);
  const steps = thumbGateFacilitationSteps();
  const [sharedInstaller, setSharedInstaller] = useState(false);

  useEffect(() => {
    void trackProductEvent('thumbgate_promo_view', { surface });
  }, [surface]);

  const openThumbGate = async () => {
    // Never await analytics before opening — a hung PostHog fetch made the CTA a no-op.
    void trackProductEvent('thumbgate_promo_tap', { surface, url: copy.url, action: 'open_web' });
    try {
      await Linking.openURL(copy.url);
    } catch {
      Alert.alert(OPEN_FAIL_TITLE, OPEN_FAIL_MESSAGE);
    }
  };

  const shareMacInstaller = async () => {
    void trackProductEvent('thumbgate_promo_tap', {
      surface,
      action: 'share_connector_install',
    });
    try {
      const result = await Share.share({
        message: THUMBGATE_CONNECTOR_INSTALL_COMMAND,
        title: 'ThumbGate Mac installer',
      });
      if (result.action === Share.sharedAction) {
        setSharedInstaller(true);
      }
    } catch {
      Alert.alert(SHARE_FAIL_TITLE, SHARE_FAIL_MESSAGE);
    }
  };

  const shareAgentSkillInstall = async () => {
    void trackProductEvent('thumbgate_promo_tap', {
      surface,
      action: 'share_agent_skill_install',
    });
    try {
      await Share.share({
        message: HERMES_MOBILE_CONNECT_SKILL_INSTALL_COMMAND,
        title: 'Hermes Mobile connect skill',
      });
    } catch {
      Alert.alert(
        'Could not share skill install',
        `Paste into a Mac terminal:\n\n${HERMES_MOBILE_CONNECT_SKILL_INSTALL_COMMAND}`,
      );
    }
  };

  return (
    <GlassCard style={[styles.card, style]} testID={`thumbgate-promo-${surface}`}>
      <Text style={styles.headline}>{copy.headline}</Text>
      <Text style={styles.body}>{copy.body}</Text>

      <View style={styles.steps} testID="thumbgate-facilitation-steps">
        {steps.map((step) => (
          <View key={step.id} style={styles.stepRow}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepBody}>{step.body}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.commandLabel} accessibilityRole="text">
        Mac installer (one-time)
      </Text>
      <Text
        style={styles.command}
        selectable
        testID="thumbgate-connector-install-command"
      >
        {THUMBGATE_CONNECTOR_INSTALL_COMMAND}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => void openThumbGate()}
          testID="thumbgate-promo-open"
          accessibilityRole="button"
          accessibilityLabel={copy.buttonLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={() => void shareMacInstaller()}
          testID="thumbgate-promo-share-installer"
          accessibilityRole="button"
          accessibilityLabel={copy.secondaryButtonLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.buttonSecondaryText}>
            {sharedInstaller
              ? THUMBGATE_CONNECTOR_INSTALL_SHARED_LABEL
              : copy.secondaryButtonLabel}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonTertiary}
          onPress={() => void shareAgentSkillInstall()}
          testID="thumbgate-promo-share-skill"
          accessibilityRole="button"
          accessibilityLabel="Share agent skill install command"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.buttonTertiaryText}>Share agent skill command</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.shareScopeNote} testID="thumbgate-share-scope-note">
        {THUMBGATE_SHARE_SCOPE_NOTE}
      </Text>
    </GlassCard>
  );
}

export { OPEN_FAIL_TITLE, OPEN_FAIL_MESSAGE, SHARE_FAIL_TITLE, SHARE_FAIL_MESSAGE };

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  headline: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  steps: {
    gap: 8,
    marginTop: 2,
  },
  shareScopeNote: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  stepRow: {
    gap: 2,
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  stepBody: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  commandLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  command: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Menlo',
    color: colors.textSecondary,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  actions: {
    gap: 8,
    marginTop: 4,
  },
  button: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.secondary,
    fontWeight: '700',
    fontSize: 13,
  },
  buttonSecondary: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  buttonTertiary: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  buttonTertiaryText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
