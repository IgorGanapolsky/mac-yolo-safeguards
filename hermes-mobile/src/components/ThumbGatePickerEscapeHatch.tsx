import React, { useEffect } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { trackProductEvent } from '../services/productAnalytics';
import { colors } from '../theme/colors';
import { thumbGatePromoCopy } from '../utils/thumbgatePromoCopy';

/**
 * Calm web escape hatch for Choose computer — not a fake Mac/profile row.
 * Opens thumbgate.app with the shared UTM params from thumbgatePromoCopy.
 */
export default function ThumbGatePickerEscapeHatch() {
  const copy = thumbGatePromoCopy('computer_picker');

  useEffect(() => {
    void trackProductEvent('thumbgate_promo_view', { surface: 'computer_picker' });
  }, []);

  const openThumbGate = async () => {
    await trackProductEvent('thumbgate_promo_tap', {
      surface: 'computer_picker',
      url: copy.url,
    });
    await Linking.openURL(copy.url);
  };

  return (
    <View style={styles.wrap} testID="thumbgate-picker-escape-hatch">
      <Text style={styles.hint}>{copy.body}</Text>
      <TouchableOpacity
        onPress={() => void openThumbGate()}
        testID="thumbgate-picker-escape-open"
        accessibilityRole="link"
        accessibilityLabel={copy.buttonLabel}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Text style={styles.link}>{copy.buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    paddingTop: 10,
    gap: 6,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondary,
  },
});
