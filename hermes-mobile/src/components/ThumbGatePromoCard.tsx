import React, { useEffect } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import GlassCard from './GlassCard';
import { trackProductEvent } from '../services/productAnalytics';
import { colors } from '../theme/colors';
import {
  thumbGatePromoCopy,
  type ThumbGatePromoSurface,
} from '../utils/thumbgatePromoCopy';

type ThumbGatePromoCardProps = {
  surface: ThumbGatePromoSurface;
  style?: object;
};

const OPEN_FAIL_TITLE = 'Could not open ThumbGate';
const OPEN_FAIL_MESSAGE =
  'Open https://thumbgate.app in your browser to continue.';

export default function ThumbGatePromoCard({ surface, style }: ThumbGatePromoCardProps) {
  const copy = thumbGatePromoCopy(surface);

  useEffect(() => {
    void trackProductEvent('thumbgate_promo_view', { surface });
  }, [surface]);

  const openThumbGate = async () => {
    // Never await analytics before opening — a hung PostHog fetch made the CTA a no-op.
    void trackProductEvent('thumbgate_promo_tap', { surface, url: copy.url });
    try {
      await Linking.openURL(copy.url);
    } catch {
      Alert.alert(OPEN_FAIL_TITLE, OPEN_FAIL_MESSAGE);
    }
  };

  return (
    <GlassCard style={[styles.card, style]} testID={`thumbgate-promo-${surface}`}>
      <Text style={styles.headline}>{copy.headline}</Text>
      <Text style={styles.body}>{copy.body}</Text>
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
    </GlassCard>
  );
}

export { OPEN_FAIL_TITLE, OPEN_FAIL_MESSAGE };

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
  button: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  buttonText: {
    color: colors.secondary,
    fontWeight: '700',
    fontSize: 13,
  },
});
