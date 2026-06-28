import React from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import type { GatewayProfile } from '../types/gatewayProfile';
import type { ConnectionMode } from '../types/gateway';
import type { RelayWorker } from '../types/mobileRelay';
import { colors } from '../theme/colors';
import { HERMES_MAC_GET_STARTED_URL } from '../utils/macPairingUx';
import {
  formatUsbHostMismatchMessage,
  profileMatchesDiscoveredGateway,
  profileMatchesHostname,
  profilesForDevicePicker,
  shouldOfferUsbLinkRepair,
  type UsbHostMismatch,
} from '../utils/gatewayProfilePicker';
import { relayWorkerDisplayName } from '../utils/relayRouting';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import MacScanProgressCard from './MacScanProgressCard';
import GatewayProfilePicker from './GatewayProfilePicker';
import RelayWorkerList from './RelayWorkerList';
import TailscaleDiscoveryBanner from './TailscaleDiscoveryBanner';
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
  onSelectProfile?: (profileId: string) => void;
  onSearchMac: () => void;
  onFixUsbLink?: () => void;
  usbFixBusy?: boolean;
  onOpenSettings?: () => void;
  tailscaleDiscoveries?: DiscoveredGateway[];
  tailscaleDiscoveryProbing?: boolean;
  onAddTailscaleComputer?: (discovery: DiscoveredGateway) => void;
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
  const usbTunnelUp = input.usbLoopback && input.macHttpOk;
  const usbTunnelDown = input.usbLoopback && !input.macHttpOk;

  const chips: ConnectionStatusChip[] = [
    {
      id: 'usb-tunnel',
      label: input.usbLoopback
        ? usbTunnelUp
          ? 'USB tunnel: Up'
          : 'USB tunnel: Down'
        : input.usbCableLikely
          ? 'USB cable: Connected'
          : 'USB tunnel: Off',
      tone: usbTunnelUp ? 'ok' : usbTunnelDown || input.usbCableLikely ? 'bad' : 'idle',
    },
    {
      id: 'mac-http',
      label: input.macHttpOk ? 'Mac HTTP: OK' : 'Mac HTTP: Down',
      tone: input.macHttpOk ? 'ok' : 'bad',
    },
    {
      id: 'relay',
      label: input.isRelayPaired ? 'Relay: Paired' : 'Relay: Unpaired',
      tone: input.isRelayPaired ? 'ok' : 'idle',
    },
    {
      id: 'wifi',
      label: input.wifiConnected
        ? input.wifiProfileReachable
          ? 'Local Wi‑Fi: Reachable'
          : 'Local Wi‑Fi: On'
        : 'Local Wi‑Fi: Off',
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

function connectionStatusLine(
  connectionState: ChatConnectionPanelProps['connectionState'],
  searching: boolean,
  macLabel?: string,
  connectionMode: ConnectionMode = 'gateway',
  isRelayPaired = false,
  usbLoopback = false,
  usbCableLikely = false,
  showUsbFix = false,
  wifiConnected = true,
  cellularBlocksDirect = false,
  usbHostMismatch: UsbHostMismatch | null = null,
): string {
  if (usbHostMismatch) {
    return formatUsbHostMismatchMessage(usbHostMismatch);
  }
  if (searching) {
    return 'Checking Hermes relay and nearby computers on your Wi‑Fi.';
  }
  if (cellularBlocksDirect) {
    if (!isRelayPaired) {
      return macLabel
        ? `On cellular — ${macLabel}'s Wi‑Fi address won't work here. Pair Hermes relay in Settings, or add a tunnel URL (Tailscale/ngrok → :8642) for Chat.`
        : "On cellular — local Wi‑Fi IPs won't reach your Mac. Pair Hermes relay or add a tunnel URL in Settings → Advanced.";
    }
    return macLabel
      ? `On cellular — Chat to ${macLabel} needs a tunnel URL in Settings → Advanced (port 8642). Relay handles approvals only.`
      : 'On cellular — Chat needs a tunnel URL in Settings → Advanced. Relay handles approvals only.';
  }
  if (!wifiConnected && connectionMode === 'relay' && !isRelayPaired) {
    return 'Off Wi‑Fi — pair Hermes relay in Settings for approvals on cellular, or add a tunnel URL for direct Chat.';
  }
  if (connectionState === 'connecting') {
    return macLabel
      ? `Connecting to ${macLabel}.`
      : 'Connecting to your Mac.';
  }
  if (showUsbFix) {
    return macLabel
      ? `Your phone is plugged in, but the USB tunnel to ${macLabel} is not up yet. Tap Fix USB link — we will set up the connection through your cable.`
      : 'Your phone is plugged in, but the USB tunnel to Hermes is not up yet. Tap Fix USB link — we will set up the connection through your cable.';
  }
  if (connectionMode === 'relay' && !isRelayPaired) {
    return 'Pair Hermes relay in Settings for Wi‑Fi, cellular, or USB. Search locally when you are on the same Wi‑Fi.';
  }
  if (usbLoopback && wifiConnected) {
    return macLabel
      ? `${macLabel} was paired over USB. On Wi‑Fi only, tap Search locally to connect directly.`
      : 'This Mac was paired over USB. On Wi‑Fi only, tap Search locally to connect directly.';
  }
  if (usbLoopback && !wifiConnected) {
    return macLabel
      ? `USB cable is connected, but the adb reverse tunnel to ${macLabel} is down. Tap Fix USB link or pick another saved computer.`
      : 'USB cable may be connected, but the adb reverse tunnel is down. Tap Fix USB link while plugged in with USB debugging authorized.';
  }
  if (usbCableLikely && Platform.OS === 'android') {
    return 'USB debugging may be active, but Hermes is not reachable through the cable yet. Tap Fix USB link or search on Wi‑Fi.';
  }
  if (macLabel) {
    return `Your phone cannot reach ${macLabel} on this network. Pair Hermes relay, connect via USB, pick another saved Mac, or search on Wi‑Fi.`;
  }
  return 'Pair Hermes relay for Wi‑Fi, cellular, or USB, connect via USB, or search locally on the same Wi‑Fi.';
}

function connectionTitle(
  connectionState: ChatConnectionPanelProps['connectionState'],
  searching: boolean,
  connectionMode: ConnectionMode = 'gateway',
  isRelayPaired = false,
  usbLoopback = false,
  showUsbFix = false,
  usbHostMismatch: UsbHostMismatch | null = null,
  cellularBlocksDirect = false,
  wifiConnected = true,
): string {
  if (usbHostMismatch) {
    return 'Wrong Mac on USB';
  }
  if (cellularBlocksDirect) {
    return 'Cellular — need tunnel';
  }
  if (searching) {
    return 'Finding Hermes';
  }
  if (connectionState === 'connecting') {
    return 'Connecting';
  }
  if (showUsbFix || (usbLoopback && !wifiConnected)) {
    return 'USB tunnel down';
  }
  if (connectionMode === 'relay' && !isRelayPaired) {
    return 'Relay not paired';
  }
  return "Can't reach your Mac";
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
  onSelectProfile,
  onSearchMac,
  onFixUsbLink,
  usbFixBusy = false,
  onOpenSettings,
  tailscaleDiscoveries = [],
  tailscaleDiscoveryProbing = false,
  onAddTailscaleComputer,
  testID = 'chat-connection-panel',
}: ChatConnectionPanelProps) {
  const showUsbFix = Boolean(
    onFixUsbLink &&
      shouldOfferUsbLinkRepair({
        gatewayUrl: usbLoopback ? 'http://127.0.0.1:8642' : '',
        wifiConnected,
        macHttpOk: activeProfileReachable,
      }) &&
      usbLoopback &&
      !usbHostMismatch,
  );
  const macHttpOk = activeProfileReachable;
  const wifiProfileReachable = macHttpOk && !usbLoopback && wifiConnected;
  const statusChips = buildConnectionStatusChips({
    macHttpOk,
    usbLoopback,
    usbCableLikely,
    isRelayPaired,
    wifiConnected,
    wifiProfileReachable,
  });
  const statusLine = connectionStatusLine(
    connectionState,
    searching,
    macLabel,
    connectionMode,
    isRelayPaired,
    usbLoopback,
    usbCableLikely,
    showUsbFix,
    wifiConnected,
    cellularBlocksDirect,
    usbHostMismatch,
  );
  const showScanCard = searching || scanResult;
  const title = connectionTitle(
    connectionState,
    searching,
    connectionMode,
    isRelayPaired,
    usbLoopback,
    showUsbFix,
    usbHostMismatch,
    cellularBlocksDirect,
    wifiConnected,
  );
  const relayWorkersNotInSaved = relayWorkers.filter(
    (worker) =>
      !profiles.some((profile) =>
        profileMatchesHostname(profile, relayWorkerDisplayName(worker)),
      ),
  );
  const pickerProfiles = profilesForDevicePicker(profiles);

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

      <View style={styles.actionRow}>
        {showUsbFix ? (
          <LoadingButton
            label="Fix USB link"
            loadingLabel="Fixing USB link…"
            loading={usbFixBusy}
            onPress={() => onFixUsbLink?.()}
            testID="chat-connection-fix-usb"
            style={styles.primaryAction}
          />
        ) : (
          <LoadingButton
            label="Search locally"
            loadingLabel="Searching…"
            loading={searching}
            onPress={onSearchMac}
            testID="chat-connection-search"
            style={styles.primaryAction}
          />
        )}
        {onOpenSettings ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onOpenSettings}
            testID="chat-open-settings-link"
          >
            <Text style={styles.secondaryButtonText}>Settings</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {pickerProfiles.length > 0 ? (
        <View style={styles.savedBlock}>
          <Text style={styles.savedHeading}>Saved computers (direct Wi‑Fi)</Text>
          <Text style={styles.savedHint}>
            Tap a machine for direct chat when you are on the same network.
          </Text>
          <GatewayProfilePicker
            profiles={pickerProfiles}
            activeProfileId={activeProfileId}
            activeReachable={activeProfileReachable}
            activeConnecting={activeProfileConnecting}
            onSelect={(profileId) => onSelectProfile?.(profileId)}
            wifiConnected={wifiConnected}
            showReachabilityHints={pickerProfiles.length > 1}
          />
        </View>
      ) : null}

      {tailscaleDiscoveries.length > 0 && onAddTailscaleComputer ? (
        <TailscaleDiscoveryBanner
          discoveries={tailscaleDiscoveries}
          adding={tailscaleDiscoveryProbing}
          onAdd={onAddTailscaleComputer}
        />
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
      ) : (
        <View style={styles.tipRow} testID="chat-connection-status-pills">
          {statusChips.map((chip) => (
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
        <Text style={styles.installLink}>Need Hermes on your Mac? Open setup →</Text>
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
  secondaryButton: {
    minWidth: 104,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: 14,
  },
  installLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
});
