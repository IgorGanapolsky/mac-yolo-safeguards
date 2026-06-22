import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import { colors } from '../theme/colors';
import { HERMES_MAC_GET_STARTED_URL } from '../utils/macPairingUx';
import MacScanProgressCard from './MacScanProgressCard';
import LoadingButton from './ui/LoadingButton';

type ChatConnectionPanelProps = {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  macLabel?: string;
  searching?: boolean;
  scanProgress?: LanScanProgress | null;
  scanResult?: LanScanResult | null;
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
    return 'Searching your Wi‑Fi network for Hermes…';
  }
  if (connectionState === 'connecting') {
    return macLabel
      ? `Connecting to ${macLabel}…`
      : 'Connecting to your Mac…';
  }
  if (macLabel) {
    return `Your phone can't reach ${macLabel} yet. Check the list above, then tap Search again.`;
  }
  return "Your phone can't reach your Mac yet. Check the list above, then tap Search again.";
}

export default function ChatConnectionPanel({
  connectionState,
  macLabel,
  searching = false,
  scanProgress = null,
  scanResult = null,
  onSearchMac,
  onOpenSettings,
  testID = 'chat-connection-panel',
}: ChatConnectionPanelProps) {
  const statusLine = connectionStatusLine(connectionState, searching, macLabel);
  const showScanCard = searching || scanResult;

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.title}>Let's link your Mac</Text>
      <Text style={styles.body}>
        Hermes Mobile talks to <Text style={styles.em}>Hermes</Text> — the assistant on your Mac.
        Chat and approvals work once your phone can see that Mac on Wi‑Fi.
      </Text>
      <View style={styles.checklist}>
        <Text style={styles.checkItem}>• Phone and Mac on the same Wi‑Fi, or link via Cloud Relay in Settings</Text>
        <Text style={styles.checkItem}>• Hermes app is installed and running on your Mac</Text>
        <Text style={styles.checkItem}>• VPN turned off on both devices if search keeps failing</Text>
      </View>
      {showScanCard ? (
        <MacScanProgressCard
          scanning={searching}
          progress={scanProgress}
          result={scanResult}
          testID="chat-connection-scan-progress"
        />
      ) : (
        <Text style={styles.statusText}>{statusLine}</Text>
      )}
      <LoadingButton
        label="Search for my Mac on Wi‑Fi"
        loadingLabel="Searching Wi‑Fi…"
        loading={searching}
        onPress={onSearchMac}
        testID="chat-connection-search"
      />
      {onOpenSettings ? (
        <TouchableOpacity style={styles.secondaryButton} onPress={onOpenSettings} testID="chat-connection-settings">
          <Text style={styles.secondaryButtonText}>Connection help in Settings</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={() => Linking.openURL(HERMES_MAC_GET_STARTED_URL)}
        testID="chat-connection-install-link"
      >
        <Text style={styles.installLink}>Don't have Hermes on your Mac yet? Learn how to install →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 4,
    marginBottom: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  em: {
    fontWeight: '800',
    color: colors.accent,
  },
  checklist: {
    gap: 4,
  },
  checkItem: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    lineHeight: 17,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  installLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
});
