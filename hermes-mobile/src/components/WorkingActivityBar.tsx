import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

type WorkingActivityBarProps = {
  visible: boolean;
  /** Optional a11y label override. */
  accessibilityLabel?: string;
};

/**
 * Thin indeterminate bar under the chat header while the Mac is working.
 * Pulse only — no fake percent complete.
 */
export default function WorkingActivityBar({
  visible,
  accessibilityLabel = 'Hermes is working on your Mac',
}: WorkingActivityBarProps) {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      slide.stopAnimation();
      slide.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(slide, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, slide]);

  if (!visible) {
    return null;
  }

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 280],
  });

  return (
    <View
      style={styles.track}
      testID="working-activity-bar"
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
    >
      <Animated.View
        style={[styles.pulse, { transform: [{ translateX }] }]}
        testID="working-activity-pulse"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
  },
  pulse: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '42%',
    borderRadius: 2,
    backgroundColor: colors.primary,
    opacity: 0.95,
  },
});
