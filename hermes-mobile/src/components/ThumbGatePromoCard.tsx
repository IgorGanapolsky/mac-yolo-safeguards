import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlassCard from './GlassCard';
import CloudContinuitySheet from './CloudContinuitySheet';
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

const OPEN_FAIL_TITLE = 'Cloud Continuity';
const OPEN_FAIL_MESSAGE =
  'Configure your cloud VPS sandbox in app settings.';

/**
 * Consumer Leash / VPS Continuity card — seamless in-app sheet.
 * Zero external redirects or promotional web links.
 */
export default function ThumbGatePromoCard({ surface, style }: ThumbGatePromoCardProps) {
  const copy = thumbGatePromoCopy(surface);
  const [sheetVisible, setSheetVisible] = useState(false);

  useEffect(() => {
    void trackProductEvent('thumbgate_promo_view', { surface });
  }, [surface]);

  const handleOpenInAppContinuity = () => {
    void trackProductEvent('thumbgate_promo_tap', { surface, action: 'open_in_app_sheet' });
    setSheetVisible(true);
  };

  return (
    <>
      <GlassCard style={[styles.card, style]} testID={`thumbgate-promo-${surface}`}>
        <Text style={styles.headline}>{copy.headline}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={handleOpenInAppContinuity}
          testID="thumbgate-promo-open"
          accessibilityRole="button"
          accessibilityLabel={copy.buttonLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
        </TouchableOpacity>
      </GlassCard>

      <CloudContinuitySheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />
    </>
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
    marginTop: 2,
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
});
