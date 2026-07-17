import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Pressable } from 'react-native';
import type { GatewayProfile } from '../types/gatewayProfile';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import MacScanProgressCard from './MacScanProgressCard';
import {
  isCablePluggedInForProfile,
  profileConnectionRouteDisplayLabel,
  profilePickerLines,
  type LiveUsbPickerInput,
} from '../utils/gatewayProfilePicker';
import { isLoopbackGatewayUrl } from '../utils/gatewayUrlPolicy';
import { colors } from '../theme/colors';
import { GATEWAY_AUTH_REPAIR_SETTINGS_STATUS } from '../services/gatewayClient';

type GatewayProfilePickerProps = {
  profiles: GatewayProfile[];
  activeProfileId: string | null;
  /** Prefer receiving the full profile so live USB rows (not yet saved) still select. */
  onSelect: (profileId: string, profile: GatewayProfile) => void;
  onRemove?: (profileId: string) => void;
  activeReachable?: boolean;
  activeConnecting?: boolean;
  authNeedsRepair?: boolean;
  scanning?: boolean;
  scanProgress?: LanScanProgress | null;
  scanResult?: LanScanResult | null;
  wifiConnected?: boolean;
  showReachabilityHints?: boolean;
  selectionDisabled?: boolean;
  /** Live cable probe — drives "plugged in" copy without a second radio per Mac. */
  liveUsb?: LiveUsbPickerInput | null;
  /**
   * When the parent owns a unified status band (Choose computer modal),
   * do not mount MacScanProgressCard — stacking caused layout thrash.
   */
  hideScanCard?: boolean;
};

export default function GatewayProfilePicker({
  profiles,
  activeProfileId,
  onSelect,
  onRemove,
  activeReachable = false,
  activeConnecting = false,
  authNeedsRepair = false,
  scanning = false,
  scanProgress = null,
  scanResult = null,
  wifiConnected = true,
  showReachabilityHints = false,
  selectionDisabled = false,
  liveUsb = null,
  hideScanCard = false,
}: GatewayProfilePickerProps) {
  const showScanCard = !hideScanCard && Boolean(scanning || scanResult);
  const multiMac = profiles.length > 1;
  const showRouteHints = showReachabilityHints || multiMac;

  return (
    <View>
      {showScanCard ? (
        <MacScanProgressCard scanning={scanning} progress={scanProgress} result={scanResult} />
      ) : null}
      {profiles.length === 0 && !scanning ? (
        <Text style={styles.emptyText}>
          No saved computers yet. Tap Find computers or scan the QR on your computer.
        </Text>
      ) : null}
      {profiles.length > 0 ? (
        <View style={styles.list} testID="gateway-profile-list">
      {profiles.map((profile) => {
        const isActive = profile.id === activeProfileId;
        const cablePluggedIn = isCablePluggedInForProfile(profile, liveUsb);
        const lines = profilePickerLines(profile, { cablePluggedIn });
        const routeHint = showRouteHints
          ? profileConnectionRouteDisplayLabel(profile, wifiConnected, { cablePluggedIn })
          : null;
        const isUsb = isLoopbackGatewayUrl(profile.gatewayUrl);
        const meta = isActive
          ? authNeedsRepair
            ? routeHint
              ? `${GATEWAY_AUTH_REPAIR_SETTINGS_STATUS} · ${routeHint}`
              : GATEWAY_AUTH_REPAIR_SETTINGS_STATUS
            : activeReachable
            ? routeHint
              ? `Connected · ${routeHint}`
              : 'Connected'
            : activeConnecting
              ? routeHint
                ? `Connecting · ${routeHint}…`
                : 'Connecting…'
              : routeHint === 'Needs home Wi‑Fi or Tailscale'
                ? 'Needs home Wi‑Fi or Tailscale'
                : 'Cannot reach this computer'
          : routeHint
            ? `${routeHint} · tap to use`
            : 'Tap to use';
        const statusColor = isActive
          ? authNeedsRepair
            ? colors.warning
            : activeReachable
            ? colors.success
            : activeConnecting
              ? colors.warning
              : colors.error
          : colors.textMuted;
        return (
          <View key={profile.id} style={styles.row} testID={`gateway-profile-item-${profile.id}`}>
            <TouchableOpacity
              style={[styles.selectButton, isActive && styles.selectButtonActive]}
              onPress={() => onSelect(profile.id, profile)}
              disabled={selectionDisabled}
              accessibilityState={{ selected: isActive, disabled: selectionDisabled }}
              accessibilityLabel={`${lines.title}, ${meta}`}
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
                <Text style={styles.profileLabel} numberOfLines={2} ellipsizeMode="tail">
                  {lines.title}
                </Text>
                {lines.detail ? (
                  <Text style={styles.profileDetail} numberOfLines={1} ellipsizeMode="middle">
                    {lines.detail}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.meta,
                    isActive && activeReachable && !authNeedsRepair ? styles.metaConnected : null,
                    isActive && authNeedsRepair ? styles.metaNeedsRepair : null,
                    isActive && !activeReachable && !authNeedsRepair ? styles.metaUnreachable : null,
                  ]}
                >
                  {meta}
                  {isActive ? ' · Now' : ''}
                </Text>
              </View>
            </TouchableOpacity>
            {onRemove && profiles.length > 1 && !isUsb ? (
              <Pressable
                style={({ pressed }) => [
                  styles.removeButton,
                  pressed ? styles.removeButtonPressed : null,
                ]}
                onPress={() => onRemove(profile.id)}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                accessibilityRole="button"
                accessibilityLabel={`Forget this Mac: ${lines.title}`}
                testID={`remove-gateway-profile-${profile.id}`}
              >
                <Text style={styles.removeText}>Forget this Mac</Text>
              </Pressable>
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
    flexShrink: 1,
  },
  profileDetail: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
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
  metaNeedsRepair: {
    color: colors.warning,
    fontWeight: '700',
  },
  removeButton: {
    minWidth: 72,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonPressed: {
    opacity: 0.7,
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
