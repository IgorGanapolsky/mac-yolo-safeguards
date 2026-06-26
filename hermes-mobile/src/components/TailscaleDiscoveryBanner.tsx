import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import { tailscaleDiscoveryLabel } from '../services/tailscaleDiscovery';
import { colors } from '../theme/colors';
import GlassCard from './GlassCard';

type TailscaleDiscoveryBannerProps = {
  discoveries: DiscoveredGateway[];
  adding?: boolean;
  onAdd: (discovery: DiscoveredGateway) => void;
};

export default function TailscaleDiscoveryBanner({
  discoveries,
  adding = false,
  onAdd,
}: TailscaleDiscoveryBannerProps) {
  if (discoveries.length === 0) {
    return null;
  }

  return (
    <GlassCard style={styles.card} testID="tailscale-discovery-banner">
      <Text style={styles.title}>Mac reachable on Tailscale</Text>
      <Text style={styles.body}>
        Hermes found another computer on your tailnet. Add it to switch between machines without
        replugging USB.
      </Text>
      <View style={styles.chips}>
        {discoveries.map((discovery) => {
          const label = tailscaleDiscoveryLabel(discovery);
          return (
            <TouchableOpacity
              key={discovery.gatewayUrl}
              style={styles.chip}
              onPress={() => onAdd(discovery)}
              disabled={adding}
              testID={`tailscale-add-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`}
            >
              <Text style={styles.chipText}>
                {adding ? 'Adding…' : `Add ${label}`}
              </Text>
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
  chipText: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 13,
  },
});
