import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import type { GatewayProfile } from '../types/gatewayProfile';
import { colors } from '../theme/colors';
import { HERMES_MAC_GET_STARTED_URL } from '../utils/macPairingUx';
import MacScanProgressCard from './MacScanProgressCard';
import GatewayProfilePicker from './GatewayProfilePicker';
import LoadingButton from './ui/LoadingButton';

type ChatConnectionPanelProps = {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  macLabel?: string;
  searching?: boolean;
  scanProgress?: LanScanProgress | null;
  scanResult?: LanScanResult | null;
  profiles?: GatewayProfile[];
  activeProfileId?: string | null;
  activeProfileReachable?: boolean;
  activeProfileConnecting?: boolean;
  onSelectProfile?: (profileId: string) => void;
  onSearchMac: () => void;
  onOpenSettings?: () => void;
  testID?: string;
};

function connectionStatusLine(
  connectionState: ChatConnectionPanelProps['connectionState'],
  searching: boolean,
  macLabel?: string,
): string {
  if (searching) {
    return 'Looking for your paired relay or a nearby Mac running Hermes.';
  }
  if (connectionState === 'connecting') {
    return macLabel
      ? `Connecting to ${macLabel}.`
      : 'Connecting to your Mac.';
  }
  if (macLabel) {
    return `Your phone cannot reach ${macLabel}. Use cloud relay, choose another saved Mac, or search locally.`;
  }
  return 'Your phone is not connected yet. Pair cloud relay or search locally to link a Mac.';
}

function connectionTitle(
  connectionState: ChatConnectionPanelProps['connectionState'],
  searching: boolean,
): string {
  if (searching) {
    return 'Finding your Mac';
  }
  if (connectionState === 'connecting') {
    return 'Connecting';
  }
  return 'Not connected';
}

export default function ChatConnectionPanel({
  connectionState,
  macLabel,
  searching = false,
  scanProgress = null,
  scanResult = null,
  profiles = [],
  activeProfileId = null,
  activeProfileReachable = false,
  activeProfileConnecting = false,
  onSelectProfile,
  onSearchMac,
  onOpenSettings,
  testID = 'chat-connection-panel',
}: ChatConnectionPanelProps) {
  const statusLine = connectionStatusLine(connectionState, searching, macLabel);
  const showScanCard = searching || scanResult;
  const title = connectionTitle(connectionState, searching);

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.hero}>
        <View style={[styles.heroOrb, searching ? styles.heroOrbSearching : null]}>
          <View style={[styles.heroOrbInner, searching ? styles.heroOrbInnerSearching : null]} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body} numberOfLines={3}>
            {statusLine}
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <LoadingButton
          label="Search locally"
          loadingLabel="Searching…"
          loading={searching}
          onPress={onSearchMac}
          testID="chat-connection-search"
          style={styles.primaryAction}
        />
        {onOpenSettings ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onOpenSettings}
            testID="chat-connection-settings"
          >
            <Text style={styles.secondaryButtonText}>Settings</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {profiles.length > 0 ? (
        <View style={styles.savedBlock}>
          <Text style={styles.savedHeading}>Saved computers</Text>
          <Text style={styles.savedHint}>
            Tap a Mac to connect.
          </Text>
          <GatewayProfilePicker
            profiles={profiles}
            activeProfileId={activeProfileId}
            activeReachable={activeProfileReachable}
            activeConnecting={activeProfileConnecting}
            onSelect={(profileId) => onSelectProfile?.(profileId)}
          />
        </View>
      ) : null}

      {showScanCard ? (
        <MacScanProgressCard
          scanning={searching}
          progress={scanProgress}
          result={scanResult}
          testID="chat-connection-scan-progress"
        />
      ) : (
        <View style={styles.tipRow}>
          <Text style={styles.tipPill}>Cloud relay</Text>
          <Text style={styles.tipPill}>Local Wi‑Fi</Text>
          <Text style={styles.tipPill}>Hermes running</Text>
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
    alignItems: 'center',
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
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
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
