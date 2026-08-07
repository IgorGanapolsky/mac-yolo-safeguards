import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated } from 'react-native';

export type UberStatusToastProps = {
  visible: boolean;
  message: string;
  subMessage?: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  onDismiss?: () => void;
};

/**
 * Uber-Style Floating Live Status Toast / Banner
 *
 * Renders a sleek, non-intrusive floating glassmorphism banner at top of chat screen
 * for auto-switch notifications, route changes, and live connection updates.
 */
export const UberStatusToast: React.FC<UberStatusToastProps> = ({
  visible,
  message,
  subMessage,
  type = 'info',
  onDismiss,
}) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        dismiss();
      }, 3500);

      return () => clearTimeout(timer);
    } else {
      dismiss();
    }
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onDismiss) onDismiss();
    });
  };

  if (!visible) return null;

  const getDotColor = () => {
    switch (type) {
      case 'success':
        return '#34C759'; // Apple success green
      case 'warning':
        return '#FF9500'; // Apple warning orange
      case 'error':
        return '#FF3B30'; // Apple error red
      default:
        return '#0A84FF'; // Apple info blue
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.contentRow}>
        <View style={[styles.statusDot, { backgroundColor: getDotColor() }]} />
        <View style={styles.textContainer}>
          <Text style={styles.titleText} numberOfLines={1}>
            {message}
          </Text>
          {subMessage ? (
            <Text style={styles.subText} numberOfLines={1}>
              {subMessage}
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: 'rgba(28, 28, 30, 0.92)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subText: {
    color: 'rgba(235, 235, 245, 0.6)',
    fontSize: 11,
    fontWeight: '400',
    marginTop: 1,
  },
});
