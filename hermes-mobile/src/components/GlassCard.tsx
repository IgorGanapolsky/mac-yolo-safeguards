import React from 'react';
import { StyleSheet, View, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { colors } from '../theme/colors';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  activeOpacity?: number;
}

/** Glassmorphic card container. */
export default function GlassCard({
  children,
  style,
  onPress,
  activeOpacity = 0.85,
}: GlassCardProps) {
  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, styles.interactive, style]}
        onPress={onPress}
        activeOpacity={activeOpacity}
      >
        <View style={styles.shine} />
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <View style={styles.shine} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 20,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  interactive: {
    borderColor: colors.border,
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
    transform: [{ skewY: '-15deg' }, { translateY: -60 }],
    pointerEvents: 'none',
  },
});
