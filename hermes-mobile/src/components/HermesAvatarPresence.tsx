import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { HermesAvatar } from '../types/gateway';
import { colors } from '../theme/colors';
import { avatarCopy } from '../utils/hermesPersona';

export type HermesAvatarPresenceProps = {
  avatar?: HermesAvatar;
  /** When true and `active`, gently pulse opacity/scale. */
  playfulMotion?: boolean;
  /** Linked, working, or waiting for approval — drives the pulse. */
  active?: boolean;
  size?: 'sm' | 'lg';
  testID?: string;
  style?: ViewStyle;
};

/**
 * Local Hermes avatar skin from Settings — shown in Chat empty-state and header.
 * Pulse respects Animated presence (`playfulMotion`) only while `active`.
 */
export default function HermesAvatarPresence({
  avatar = 'orb',
  playfulMotion = true,
  active = false,
  size = 'lg',
  testID = 'hermes-avatar-presence',
  style,
}: HermesAvatarPresenceProps) {
  const copy = avatarCopy(avatar);
  const pulse = useRef(new Animated.Value(0)).current;
  const shouldPulse = Boolean(playfulMotion && active);
  const isLarge = size === 'lg';

  useEffect(() => {
    if (!shouldPulse) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.stopAnimation();
    };
  }, [pulse, shouldPulse]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, isLarge ? 1.08 : 1.12],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });

  return (
    <View
      style={[styles.wrap, isLarge ? styles.wrapLg : styles.wrapSm, style]}
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`Hermes avatar ${copy.label}${shouldPulse ? ', animated presence' : ''}`}
    >
      {shouldPulse ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            isLarge ? styles.haloLg : styles.haloSm,
            { opacity, transform: [{ scale }] },
          ]}
          testID={`${testID}-halo`}
        />
      ) : null}
      <View
        style={[styles.orb, isLarge ? styles.orbLg : styles.orbSm]}
        testID={`${testID}-orb`}
      >
        <Text
          style={[styles.emoji, isLarge ? styles.emojiLg : styles.emojiSm]}
          testID={`${testID}-emoji`}
        >
          {copy.emoji}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapLg: {
    width: 72,
    height: 72,
  },
  wrapSm: {
    width: 28,
    height: 28,
  },
  halo: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(79, 70, 229, 0.35)',
  },
  haloLg: {
    width: 72,
    height: 72,
  },
  haloSm: {
    width: 28,
    height: 28,
  },
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBgHover,
  },
  orbLg: {
    width: 56,
    height: 56,
  },
  orbSm: {
    width: 24,
    height: 24,
  },
  emoji: {
    color: colors.text,
    textAlign: 'center',
  },
  emojiLg: {
    fontSize: 26,
    lineHeight: 30,
  },
  emojiSm: {
    fontSize: 12,
    lineHeight: 14,
  },
});
