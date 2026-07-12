import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import { tailscaleDiscoveryLabel } from '../services/tailscaleDiscovery';
import { colors } from '../theme/colors';
import GlassCard from './GlassCard';

type TailscaleDiscoveryBannerProps = {
  discoveries: DiscoveredGateway[];
  adding?: boolean;
  probing?: boolean;
  onAdd?: (discovery: DiscoveredGateway) => void;
  /** When true, renders as the primary action block (Switch computer / onboarding). */
  prominent?: boolean;
  /** Label chips as Switch to [name] instead of Add [name]. */
  switchMode?: boolean;
};

export default function TailscaleDiscoveryBanner({
  discoveries,
  adding = false,
  probing = false,
  onAdd,
  prominent = false,
  switchMode = false,
}: TailscaleDiscoveryBannerProps) {
  if (discoveries.length === 0 && !probing) {
    return null;
  }

  const cardStyle = prominent ? styles.cardProminent : styles.card;

  if (discoveries.length === 0 && probing) {
    return (
      <GlassCard style={cardStyle} testID="tailscale-discovery-probing">
        <Text style={styles.title}>On Tailscale — searching for your computer</Text>
        <Text style={styles.body}>
          Looking for Hermes on your tailnet. Works on cellular or any Wi‑Fi when Tailscale is on
          both devices.
        </Text>
      </GlassCard>
    );
  }

  return (
    <GlassCard style={cardStyle} testID="tailscale-discovery-banner">
      <Text style={styles.title}>
        {switchMode ? 'Another computer is available' : 'Computer found on Tailscale'}
      </Text>
      <Text style={styles.body}>
        {switchMode
          ? 'Your saved computer is unreachable. Switch to one that is online on Tailscale.'
          : prominent
            ? 'Tap below to add your computer — works on cellular or any Wi‑Fi when Tailscale is running on both devices.'
            : 'Add your computer to switch between machines without a USB cable.'}
      </Text>
      <View style={styles.chips}>
        {discoveries.map((discovery) => {
          const label = tailscaleDiscoveryLabel(discovery);
          const chipLabel = switchMode
            ? adding
              ? 'Switching…'
              : `Switch to ${label}`
            : adding
              ? 'Adding…'
              : `Add ${label}`;
          return (
            <TouchableOpacity
              key={discovery.gatewayUrl}
              style={[styles.chip, prominent ? styles.chipProminent : null]}
              onPress={() => onAdd?.(discovery)}
              disabled={adding || !onAdd}
              testID={`tailscale-add-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`}
            >
              <Text style={styles.chipText}>{chipLabel}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  cardProminent: {
    marginBottom: 0,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  title: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 6,
  },
  body: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  chipProminent: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  chipText: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 13,
  },
});
