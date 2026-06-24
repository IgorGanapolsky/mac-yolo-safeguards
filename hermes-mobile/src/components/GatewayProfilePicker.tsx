import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import type { GatewayProfile } from '../types/gatewayProfile';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import { formatProfileLabel } from '../services/gatewayProfiles';
import MacScanProgressCard from './MacScanProgressCard';
import { colors } from '../theme/colors';

type GatewayProfilePickerProps = {
  profiles: GatewayProfile[];
  activeProfileId: string | null;
  onSelect: (profileId: string) => void;
  onRemove?: (profileId: string) => void;
  activeReachable?: boolean;
  activeConnecting?: boolean;
  scanning?: boolean;
  scanProgress?: LanScanProgress | null;
  scanResult?: LanScanResult | null;
};

export default function GatewayProfilePicker({
  profiles,
  activeProfileId,
  onSelect,
  onRemove,
  activeReachable = false,
  activeConnecting = false,
  scanning = false,
  scanProgress = null,
  scanResult = null,
}: GatewayProfilePickerProps) {
  const showScanCard = scanning || scanResult;

  return (
    <View>
      {showScanCard ? (
        <MacScanProgressCard scanning={scanning} progress={scanProgress} result={scanResult} />
      ) : null}
      {profiles.length === 0 && !scanning ? (
        <Text style={styles.emptyText}>
          No saved computers yet. Scan a QR or tap Find computers on Wi‑Fi.
        </Text>
      ) : null}
      {profiles.length > 0 ? (
        <View style={styles.list} testID="gateway-profile-list">
      {profiles.map((profile) => {
        const isActive = profile.id === activeProfileId;
        const meta = isActive
          ? activeReachable
            ? 'Connected'
            : activeConnecting
              ? 'Trying to connect…'
              : 'Selected · cannot reach'
          : 'Tap to switch';
        return (
          <View key={profile.id} style={styles.row} testID={`gateway-profile-item-${profile.id}`}>
            <TouchableOpacity
              style={[styles.selectButton, isActive && styles.selectButtonActive]}
              onPress={() => onSelect(profile.id)}
              accessibilityState={{ selected: isActive }}
              testID={`select-gateway-profile-${profile.id}`}
            >
              <View style={styles.selectDot}>
                {isActive ? <View style={styles.selectDotInner} /> : null}
              </View>
              <View style={styles.labelBlock}>
                <Text style={styles.profileLabel}>{formatProfileLabel(profile)}</Text>
                <Text
                  style={[
                    styles.meta,
                    isActive && activeReachable ? styles.metaConnected : null,
                    isActive && !activeReachable ? styles.metaUnreachable : null,
                  ]}
                >
                  {meta}
                </Text>
              </View>
            </TouchableOpacity>
            {onRemove && profiles.length > 1 ? (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => onRemove(profile.id)}
                testID={`remove-gateway-profile-${profile.id}`}
              >
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.cardBg,
  },
  selectButtonActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  selectDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  labelBlock: {
    flex: 1,
  },
  profileLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  metaConnected: {
    color: colors.success,
    fontWeight: '700',
  },
  metaUnreachable: {
    color: colors.warning,
    fontWeight: '700',
  },
  removeButton: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  removeText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
});
