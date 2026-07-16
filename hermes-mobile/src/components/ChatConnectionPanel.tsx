import React, { useState } from 'react';
import { Keyboard, Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import type { GatewayProfile } from '../types/gatewayProfile';
import type { ConnectionMode } from '../types/gateway';
import type { RelayWorker } from '../types/mobileRelay';
import { colors } from '../theme/colors';
import { cleanManualGatewayUrl } from '../utils/gatewayUrlPolicy';
import { isTailscaleGatewayUrl } from '../utils/tailscaleHosts';
import { haptics } from '../services/haptics';
import { HERMES_MAC_GET_STARTED_URL } from '../utils/macPairingUx';
import {
  formatUsbHostMismatchMessage,
  hasOnlyLoopbackProfiles,
  profileMatchesDiscoveredGateway,
  profileMatchesHostname,
  profilesForSwitchComputerPicker,
  shouldOfferUsbLinkRepair,
  type LiveUsbPickerInput,
  type UsbHostMismatch,
} from '../utils/gatewayProfilePicker';
import { relayWorkerDisplayName } from '../utils/relayRouting';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import {
  freshUserConnectionBody,
  freshUserConnectionTitle,
  freshUserPrimaryActionLabel,
  shouldHideConnectionStatusChips,
  shouldShowFreshUserOnboardingSteps,
  isOnTailscaleRoute,
} from '../utils/freshUserOnboarding';
import { connectionHealSnapshot } from '../utils/connectionErrorPolicy';
import { tailscaleDiscoveryLabel } from '../services/tailscaleDiscovery';
import MacScanProgressCard from './MacScanProgressCard';
import GatewayProfilePicker from './GatewayProfilePicker';
import RelayWorkerList from './RelayWorkerList';
import TailscaleDiscoveryBanner from './TailscaleDiscoveryBanner';
import FreshUserOnboardingCard from './FreshUserOnboardingCard';
import LoadingButton from './ui/LoadingButton';

type ChatConnectionPanelProps = {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  connectionMode?: ConnectionMode;
  isRelayPaired?: boolean;
  relayWorkers?: RelayWorker[];
  activeRelayWorkerId?: string | null;
  macLabel?: string;
  searching?: boolean;
  scanProgress?: LanScanProgress | null;
  scanResult?: LanScanResult | null;
  profiles?: GatewayProfile[];
  activeProfileId?: string | null;
  activeProfileReachable?: boolean;
  activeProfileConnecting?: boolean;
  usbLoopback?: boolean;
  usbCableLikely?: boolean;
  wifiConnected?: boolean;
  cellularBlocksDirect?: boolean;
  usbHostMismatch?: UsbHostMismatch | null;
  connectionHealAttempt?: number;
  connectionHealInFlight?: boolean;
  selectionDisabled?: boolean;
  onSelectProfile?: (profileId: string, profile?: GatewayProfile) => void;
  onSearchMac: () => void;
  onFixUsbLink?: () => void;
  usbFixBusy?: boolean;
  onOpenSettings?: () => void;
  tailscaleDiscoveries?: DiscoveredGateway[];
  tailscaleDiscoveryProbing?: boolean;
  tailnetProbeHostCount?: number;
  onAddTailscaleComputer?: (discovery: DiscoveredGateway) => void;
  onAddProfile?: (label: string, gatewayUrl: string) => Promise<void>;
  liveUsb?: LiveUsbPickerInput | null;
  testID?: string;
};

export type ConnectionStatusChip = {
  id: string;
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'idle';
};

export function buildConnectionStatusChips(input: {
  macHttpOk: boolean;
  usbLoopback: boolean;
  usbCableLikely: boolean;
  isRelayPaired: boolean;
  wifiConnected: boolean;
  wifiProfileReachable: boolean;
}): ConnectionStatusChip[] {
  const chips: ConnectionStatusChip[] = [
    {
      id: 'mac-http',
      label: input.macHttpOk ? 'Your computer: Reachable' : 'Your computer: Unreachable',
      tone: input.macHttpOk ? 'ok' : 'bad',
    },
    {
      id: 'wifi',
      label: input.wifiConnected
        ? input.wifiProfileReachable
          ? 'Home Wi‑Fi: Connected'
          : 'Home Wi‑Fi: On'
        : 'Home Wi‑Fi: Off',
      tone: input.wifiProfileReachable ? 'ok' : input.wifiConnected ? 'warn' : 'idle',
    },
  ];

  return chips;
}

function chipColor(tone: ConnectionStatusChip['tone']): string {
  if (tone === 'ok') return colors.success;
  if (tone === 'bad') return colors.error;
  if (tone === 'warn') return colors.warning;
  return colors.textMuted;
}

export default function ChatConnectionPanel({
  connectionState,
  connectionMode = 'gateway',
  isRelayPaired = false,
  relayWorkers = [],
  activeRelayWorkerId = null,
  macLabel,
  searching = false,
  scanProgress = null,
  scanResult = null,
  profiles = [],
  activeProfileId = null,
  activeProfileReachable = false,
  activeProfileConnecting = false,
  usbLoopback = false,
  usbCableLikely = false,
  wifiConnected = true,
  cellularBlocksDirect = false,
  usbHostMismatch = null,
  connectionHealAttempt = 0,
  connectionHealInFlight = false,
  selectionDisabled = false,
  onSelectProfile,
  onSearchMac,
  onFixUsbLink,
  usbFixBusy = false,
  onOpenSettings,
  tailscaleDiscoveries = [],
  tailscaleDiscoveryProbing = false,
  tailnetProbeHostCount = 0,
  onAddTailscaleComputer,
  onAddProfile,
  liveUsb = null,
  testID = 'chat-connection-panel',
}: ChatConnectionPanelProps) {
  const [manualInput, setManualInput] = useState('');
  const [addingProfile, setAddingProfile] = useState(false);
  const [manualInputError, setManualInputError] = useState<string | null>(null);

  const handleManualConnect = async () => {
    Keyboard.dismiss();
    const cleaned = cleanManualGatewayUrl(manualInput);
    if (!cleaned) {
      setManualInputError('Please enter an IP address or URL.');
      return;
    }
    setManualInputError(null);
    setAddingProfile(true);
    try {
      const isTailscale = isTailscaleGatewayUrl(cleaned);
      const label = isTailscale ? 'Tailscale computer' : 'Custom computer';
      if (onAddProfile) {
        await onAddProfile(label, cleaned);
      }
      setManualInput('');
      haptics.success();
    } catch (err) {
      setManualInputError(err instanceof Error ? err.message : 'Could not add profile.');
      haptics.warning();
    } finally {
      setAddingProfile(false);
    }
  };

  const heal = connectionHealSnapshot(connectionHealAttempt, connectionHealInFlight);
  const onlyLoopbackProfiles = hasOnlyLoopbackProfiles(profiles);
  const showUsbFix = Boolean(
    onFixUsbLink &&
      shouldOfferUsbLinkRepair({
        gatewayUrl: usbLoopback ? 'http://127.0.0.1:8642' : '',
        wifiConnected,
        macHttpOk: activeProfileReachable,
        tailnetProbeHostCount,
        tailscaleDiscoveryCount: tailscaleDiscoveries.length,
        onlyLoopbackProfiles,
      }) &&
      usbLoopback &&
      !usbHostMismatch,
  );
  const tailscaleSearching =
    tailscaleDiscoveryProbing &&
    tailscaleDiscoveries.length === 0 &&
    (tailnetProbeHostCount > 0 || onlyLoopbackProfiles);
  const macHttpOk = activeProfileReachable;
  const wifiProfileReachable = macHttpOk && !usbLoopback && wifiConnected;
  const showOnboardingSteps = shouldShowFreshUserOnboardingSteps({ profiles, heal });
  const hideStatusChips = shouldHideConnectionStatusChips({ profiles, heal });
  const freshUser = profiles.length === 0 || showOnboardingSteps;
  const onTailscaleRoute = isOnTailscaleRoute(profiles, activeProfileId);
  const primaryTailscaleLabel =
    tailscaleDiscoveries.length > 0
      ? tailscaleDiscoveryLabel(tailscaleDiscoveries[0])
      : undefined;
  const title = freshUserConnectionTitle({
    searching,
    showUsbFix,
    usbHostMismatch: Boolean(usbHostMismatch),
    cellularBlocksDirect,
    freshUser: profiles.length === 0,
    tailscaleSearching,
  });
  const statusLine = freshUserConnectionBody({
    searching,
    healInFlight: heal.inFlight,
    healExhausted: heal.exhausted,
    healAttempt: heal.attempt,
    freshUser: profiles.length === 0,
    macLabel,
    cellularBlocksDirect,
    showUsbFix,
    tailscaleSearching,
    onTailscaleRoute,
    usbHostMismatchMessage: usbHostMismatch
      ? formatUsbHostMismatchMessage(usbHostMismatch)
      : undefined,
  });
  const showScanCard = searching || scanResult;
  const relayWorkersNotInSaved = relayWorkers.filter(
    (worker) =>
      !profiles.some((profile) =>
        profileMatchesHostname(profile, relayWorkerDisplayName(worker)),
      ),
  );
  const pickerProfiles = profilesForSwitchComputerPicker(profiles, {
    activeProfileId,
    liveUsb,
  });
  const primaryActionLabel = freshUserPrimaryActionLabel(showUsbFix);

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.hero}>
        <View style={[styles.heroOrb, searching ? styles.heroOrbSearching : null]}>
          <View style={[styles.heroOrbInner, searching ? styles.heroOrbInnerSearching : null]} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body} textBreakStrategy="highQuality">
            {statusLine}
          </Text>
        </View>
      </View>

      {showOnboardingSteps ? (
        <FreshUserOnboardingCard
          profiles={profiles}
          activeProfileId={activeProfileId}
          tailscaleMacLabel={primaryTailscaleLabel}
          wifiConnected={wifiConnected}
        />
      ) : null}

      {(tailscaleDiscoveries.length > 0 || tailscaleSearching) ? (
        <TailscaleDiscoveryBanner
          discoveries={tailscaleDiscoveries}
          adding={tailscaleDiscoveryProbing}
          probing={tailscaleSearching}
          onAdd={onAddTailscaleComputer}
          prominent
        />
      ) : null}

      <View style={styles.actionRow}>
        {showUsbFix ? (
          <LoadingButton
            label={primaryActionLabel}
            loadingLabel="Fixing USB connection…"
            loading={usbFixBusy}
            onPress={() => onFixUsbLink?.()}
            testID="chat-connection-fix-usb"
            style={styles.primaryAction}
          />
        ) : (
          <LoadingButton
            label={primaryActionLabel}
            loadingLabel="Finding computers…"
            loading={searching}
            onPress={onSearchMac}
            testID="chat-connection-search"
            style={styles.primaryAction}
          />
        )}
      </View>

      {onAddProfile ? (
        <View style={styles.manualEntry}>
          <Text style={styles.manualEntryTitle}>Connect manually (Tailscale or IP)</Text>
          <Text style={styles.manualEntrySubtitle}>
            Add by entering your computer's Tailscale or local IP address:
          </Text>
          <View style={styles.manualInputRow}>
            <TextInput
              style={styles.manualInput}
              placeholder="e.g. your-device-name or a 100.x address"
              placeholderTextColor={colors.textMuted}
              value={manualInput}
              onChangeText={setManualInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              testID="chat-manual-input"
            />
            <LoadingButton
              label="Connect"
              loadingLabel="Connecting…"
              loading={addingProfile}
              onPress={handleManualConnect}
              testID="chat-manual-submit"
              style={styles.manualButton}
            />
          </View>
          {manualInputError ? (
            <Text style={styles.manualError} testID="chat-manual-error">
              {manualInputError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {onOpenSettings ? (
        <TouchableOpacity
          onPress={onOpenSettings}
          testID="chat-open-settings-link"
          accessibilityRole="link"
        >
          <Text style={styles.settingsLink}>Advanced options in Settings</Text>
        </TouchableOpacity>
      ) : null}

      {pickerProfiles.length > 0 ? (
        <View style={styles.savedBlock}>
          <Text style={styles.savedHeading}>Your computers</Text>
          <Text style={styles.savedHint}>
            Tap the computer to use. Plugged-in Macs are chosen automatically when the cable is
            connected.
          </Text>
          <GatewayProfilePicker
            profiles={pickerProfiles}
            activeProfileId={activeProfileId}
            activeReachable={activeProfileReachable}
            activeConnecting={activeProfileConnecting}
            selectionDisabled={selectionDisabled}
            onSelect={(profileId, profile) => onSelectProfile?.(profileId, profile)}
            wifiConnected={wifiConnected}
            showReachabilityHints={pickerProfiles.length > 1}
            liveUsb={liveUsb}
          />
        </View>
      ) : null}

      {relayWorkersNotInSaved.length > 0 ? (
        <RelayWorkerList workers={relayWorkersNotInSaved} activeWorkerId={activeRelayWorkerId} />
      ) : null}

      {showScanCard ? (
        <MacScanProgressCard
          scanning={searching}
          progress={scanProgress}
          result={scanResult}
          testID="chat-connection-scan-progress"
        />
      ) : hideStatusChips ? null : (
        <View style={styles.tipRow} testID="chat-connection-status-pills">
          {buildConnectionStatusChips({
            macHttpOk,
            usbLoopback,
            usbCableLikely,
            isRelayPaired,
            wifiConnected,
            wifiProfileReachable,
          }).map((chip) => (
            <View
              key={chip.id}
              style={[styles.tipPill, styles.statusPill]}
              testID={`status-pill-${chip.id}`}
            >
              <View
                style={[
                  styles.statusPillDot,
                  { backgroundColor: chipColor(chip.tone) },
                ]}
              />
              <Text style={styles.statusPillText}>{chip.label}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={() => Linking.openURL(HERMES_MAC_GET_STARTED_URL)}
        testID="chat-connection-install-link"
      >
        <Text style={styles.installLink}>Need Hermes on your computer? Open setup guide →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  heroOrb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  heroOrbSearching: {
    borderColor: 'rgba(34, 211, 238, 0.42)',
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
  },
  heroOrbInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
  },
  heroOrbInnerSearching: {
    backgroundColor: colors.accent,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0,
  },
  body: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
  },
  settingsLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  savedBlock: {
    gap: 10,
  },
  savedHeading: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  savedHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  tipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tipPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  installLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  manualEntry: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 8,
  },
  manualEntryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  manualEntrySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  manualInput: {
    flex: 1,
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 13,
  },
  manualButton: {
    paddingVertical: 10,
    height: 44,
    minWidth: 90,
  },
  manualError: {
    fontSize: 12,
    color: colors.error,
    marginTop: 2,
  },
});
