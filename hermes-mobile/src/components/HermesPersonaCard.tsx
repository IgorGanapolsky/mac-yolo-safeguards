import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { RunProgressState } from '../types/chatDisplay';
import type { HermesAvatar, HermesPersona } from '../types/gateway';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';
import { avatarCopy, personaCopy } from '../utils/hermesPersona';

type HermesPersonaCardProps = {
  persona?: HermesPersona;
  avatar?: HermesAvatar;
  motion?: boolean;
  connectionState: LeashConnectionState;
  macHttpReachable?: boolean;
  runProgress?: RunProgressState | null;
  pendingApprovalCount?: number;
};

function moodFor(
  connectionState: LeashConnectionState,
  runProgress?: RunProgressState | null,
  pendingApprovalCount = 0,
  macHttpReachable = false,
): { label: string; color: string } {
  if (pendingApprovalCount > 0) {
    return { label: 'Needs approval', color: colors.warning };
  }
  if (runProgress && runProgress.phase !== 'completed' && runProgress.phase !== 'failed') {
    return { label: 'Working', color: colors.accent };
  }
  if (connectionState === 'connected' || macHttpReachable) {
    return { label: 'Ready', color: colors.success };
  }
  if (connectionState === 'demo') {
    return { label: 'Demo', color: colors.accent };
  }
  if (connectionState === 'connecting') {
    return { label: 'Linking', color: colors.warning };
  }
  return { label: 'Waiting for Mac', color: colors.error };
}

export default function HermesPersonaCard({
  persona,
  avatar,
  motion = true,
  connectionState,
  macHttpReachable = false,
  runProgress,
  pendingApprovalCount = 0,
}: HermesPersonaCardProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const personaDetails = personaCopy(persona);
  const avatarDetails = avatarCopy(avatar);
  const mood = useMemo(
    () => moodFor(connectionState, runProgress, pendingApprovalCount, macHttpReachable),
    [connectionState, macHttpReachable, pendingApprovalCount, runProgress],
  );

  useEffect(() => {
    if (!motion) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [motion, pulse]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.95],
  });

  return (
    <View style={styles.card} testID="hermes-persona-card">
      <Animated.View
        style={[
          styles.avatarRing,
          {
            borderColor: mood.color,
            opacity: motion ? opacity : 0.75,
            transform: [{ scale: motion ? scale : 1 }],
          },
        ]}
      >
        <Text style={styles.avatarText} testID="hermes-avatar">
          {avatarDetails.emoji}
        </Text>
      </Animated.View>
      <View style={styles.copy}>
        <Text style={styles.nameLine} numberOfLines={1}>
          Hermes {personaDetails.label}
        </Text>
        <Text style={styles.tagline} numberOfLines={1}>
          {personaDetails.tagline}
        </Text>
      </View>
      <View style={[styles.moodPill, { borderColor: mood.color }]}>
        <Text style={[styles.moodText, { color: mood.color }]} testID="hermes-mood">
          {mood.label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 12,
    minHeight: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  nameLine: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  tagline: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  moodPill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
  },
  moodText: {
    fontSize: 10,
    fontWeight: '900',
  },
});
