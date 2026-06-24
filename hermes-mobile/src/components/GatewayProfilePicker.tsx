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
          No saved Macs yet. Search Wi‑Fi or scan the QR on your Mac.
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
              ? 'Connecting…'
              : 'Cannot reach this Mac'
          : 'Tap to connect';
        const statusColor = isActive
          ? activeReachable
            ? colors.success
            : activeConnecting
              ? colors.warning
              : colors.error
          : colors.textMuted;
        return (
          <View key={profile.id} style={styles.row} testID={`gateway-profile-item-${profile.id}`}>
            <TouchableOpacity
              style={[styles.selectButton, isActive && styles.selectButtonActive]}
              onPress={() => onSelect(profile.id)}
              accessibilityState={{ selected: isActive }}
              testID={`select-gateway-profile-${profile.id}`}
            >
              <View style={[styles.selectDot, { borderColor: statusColor }]}>
                <View
                  style={[
                    styles.selectDotInner,
                    { backgroundColor: isActive ? statusColor : 'transparent' },
                  ]}
                />
              </View>
              <View style={styles.labelBlock}>
                <Text style={styles.profileLabel} numberOfLines={1}>
                  {formatProfileLabel(profile)}
                </Text>
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
              <Text style={styles.chevron}>{isActive ? 'Now' : '›'}</Text>
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
    gap: 10,
    marginBottom: 4,
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
    gap: 12,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
  },
  selectButtonActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(34, 211, 238, 0.09)',
  },
  selectDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
    minWidth: 0,
  },
  profileLabel: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 15,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
    fontWeight: '700',
  },
  metaConnected: {
    color: colors.success,
    fontWeight: '700',
  },
  metaUnreachable: {
    color: colors.warning,
    fontWeight: '700',
  },
  chevron: {
    minWidth: 28,
    textAlign: 'right',
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
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
