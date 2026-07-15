import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useGateway } from '../context/GatewayContext';
import { colors } from '../theme/colors';
import { describeBootstrapPhase } from '../utils/gatewayConnection';
import PairQrScannerModal from './PairQrScannerModal';
import FreshUserOnboardingCard from './FreshUserOnboardingCard';
import TailscaleDiscoveryBanner from './TailscaleDiscoveryBanner';
import MacScanProgressCard from './MacScanProgressCard';
import GatewayProfilePicker from './GatewayProfilePicker';
import LoadingButton from './ui/LoadingButton';
import { tailscaleDiscoveryLabel } from '../services/tailscaleDiscovery';
import { cleanManualGatewayUrl, isLoopbackGatewayUrl } from '../utils/gatewayUrlPolicy';
import { isTailscaleGatewayUrl } from '../utils/tailscaleHosts';
import { hasValidSavedComputer } from '../utils/freshUserOnboarding';
import { profilesForDevicePicker } from '../utils/gatewayProfilePicker';
import {
  isE2eAutomationBuild,
  isStoreReviewDemoBuild,
  isDemoModeAllowed,
} from '../utils/demoModePolicy';
import { haptics } from '../services/haptics';

const AUTO_RETRY_MS = 12000;

/**
 * First-run gate when no Mac is configured and the gateway is not reachable.
 * Plain-language numbered steps — one primary CTA (Find computers).
 */
export default function ConnectMacGate() {
  const {
    settings,
    gatewayBootstrapPhase,
    isGatewayReachable,
    bootstrapReady,
    profileScanning,
    profileScanProgress,
    profileScanResult,
    gatewayProfiles,
    activeGatewayProfile,
    effectiveGatewayUrl,
    wifiConnected,
    applySetupDeepLink,
    retryGatewayBootstrap,
    scanForGatewayProfiles,
    tailscaleDiscoveries,
    tailscaleDiscoveryProbing,
    addDiscoveredTailscaleComputer,
    probeTailscaleComputers,
    addGatewayProfile,
    patchSettings,
    selectGatewayProfile,
  } = useGateway();

  const [qrVisible, setQrVisible] = useState(false);
  const [invalidQrHint, setInvalidQrHint] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [manualInput, setManualInput] = useState('');
  const [addingProfile, setAddingProfile] = useState(false);
  const [manualInputError, setManualInputError] = useState<string | null>(null);
  const [enablingDemo, setEnablingDemo] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const dismissGate = useCallback(async () => {
    if (dismissing) {
      return;
    }
    setDismissing(true);
    try {
      await patchSettings({ connectMacGateDismissed: true });
      haptics.light();
    } catch {
      haptics.warning();
    } finally {
      setDismissing(false);
    }
  }, [dismissing, patchSettings]);

  const handleExploreDemo = async () => {
    setEnablingDemo(true);
    try {
      await patchSettings({ demoMode: true });
      haptics.success();
    } catch {
      haptics.warning();
    } finally {
      setEnablingDemo(false);
    }
  };

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
      await addGatewayProfile(label, cleaned);
      setManualInput('');
      haptics.success();
      await retryGatewayBootstrap();
    } catch (err) {
      setManualInputError(err instanceof Error ? err.message : 'Could not add profile.');
      haptics.warning();
    } finally {
      setAddingProfile(false);
    }
  };

  const hasSavedMac =
    hasValidSavedComputer(
      gatewayProfiles.filter((profile) => !isLoopbackGatewayUrl(profile.gatewayUrl)),
    ) ||
    [effectiveGatewayUrl, settings.gatewayUrl].some(
      (url) => Boolean(url?.trim()) && !isLoopbackGatewayUrl(url || ''),
    );

  const showGate =
    bootstrapReady &&
    !isE2eAutomationBuild() &&
    !isStoreReviewDemoBuild() &&
    !settings.demoMode &&
    !settings.connectMacGateDismissed &&
    !isGatewayReachable &&
    settings.connectionMode === 'gateway' &&
    !hasSavedMac;

  const cellularBlocksDirect = !wifiConnected;
  const activeProfileId = activeGatewayProfile?.id ?? null;
  const pickerProfiles = profilesForDevicePicker(gatewayProfiles).filter(
    (profile) => !isLoopbackGatewayUrl(profile.gatewayUrl),
  );

  const searching =
    isSearching ||
    gatewayBootstrapPhase === 'booting' ||
    gatewayBootstrapPhase === 'searching' ||
    profileScanning;

  const runWifiSearch = useCallback(async () => {
    setInvalidQrHint(null);
    setIsSearching(true);
    try {
      await scanForGatewayProfiles();
      await retryGatewayBootstrap();
      void probeTailscaleComputers();
    } finally {
      setIsSearching(false);
    }
  }, [probeTailscaleComputers, retryGatewayBootstrap, scanForGatewayProfiles]);

  useEffect(() => {
    if (!showGate) {
      return;
    }
    void probeTailscaleComputers();
  }, [probeTailscaleComputers, showGate]);

  useEffect(() => {
    if (!showGate || searching) {
      return;
    }
    const timer = setInterval(() => {
      runWifiSearch();
    }, AUTO_RETRY_MS);
    return () => clearInterval(timer);
  }, [showGate, searching, runWifiSearch]);

  useEffect(() => {
    if (!showGate) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void dismissGate();
      return true;
    });
    return () => subscription.remove();
  }, [dismissGate, showGate]);

  const primaryTailscaleLabel =
    tailscaleDiscoveries.length > 0
      ? tailscaleDiscoveryLabel(tailscaleDiscoveries[0])
      : undefined;

  return (
    <>
      {showGate ? (
        <View style={styles.overlay} testID="connect-mac-gate">
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Connect your computer</Text>
                <TouchableOpacity
                  onPress={() => void dismissGate()}
                  disabled={dismissing}
                  accessibilityRole="button"
                  accessibilityLabel="Not now"
                  testID="connect-mac-gate-dismiss"
                >
                  <Text style={styles.dismissText}>{dismissing ? '…' : 'Not now'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.body}>
                Hermes on your phone talks to Hermes on your computer. Follow the steps below
                {cellularBlocksDirect
                  ? ' — on cellular, use Tailscale to reach your Mac.'
                  : ' — we search your home Wi‑Fi automatically.'}
              </Text>

              <FreshUserOnboardingCard
                profiles={gatewayProfiles}
                tailscaleMacLabel={primaryTailscaleLabel}
                cellularBlocksDirect={cellularBlocksDirect}
                testID="connect-mac-onboarding-card"
              />

              {tailscaleDiscoveries.length > 0 ? (
                <TailscaleDiscoveryBanner
                  discoveries={tailscaleDiscoveries}
                  adding={tailscaleDiscoveryProbing}
                  onAdd={(discovery) => {
                    void addDiscoveredTailscaleComputer(discovery);
                  }}
                  prominent
                />
              ) : null}

              <MacScanProgressCard
                scanning={searching}
                progress={profileScanProgress}
                result={profileScanResult}
                testID="connect-mac-scan-progress"
              />

              {pickerProfiles.length > 0 ? (
                <GatewayProfilePicker
                  profiles={pickerProfiles}
                  activeProfileId={activeProfileId}
                  onSelect={(profileId, profile) => {
                    void selectGatewayProfile(profileId, { ensureProfile: profile }).then(() =>
                      retryGatewayBootstrap(),
                    );
                  }}
                  scanning={false}
                  scanProgress={null}
                  scanResult={null}
                  wifiConnected={wifiConnected}
                  showReachabilityHints={pickerProfiles.length > 1}
                />
              ) : null}

              {!searching && !profileScanResult ? (
                <Text style={styles.statusText}>{describeBootstrapPhase(gatewayBootstrapPhase)}</Text>
              ) : null}

              {invalidQrHint ? <Text style={styles.hintError}>{invalidQrHint}</Text> : null}

              <LoadingButton
                label="Find computers"
                loadingLabel="Finding computers…"
                loading={searching}
                onPress={() => runWifiSearch()}
                testID="connect-search-wifi"
              />

              <LoadingButton
                label="Scan QR from your computer"
                variant="secondary"
                onPress={() => {
                  setInvalidQrHint(null);
                  setQrVisible(true);
                }}
                testID="connect-scan-qr"
              />

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
                    testID="connect-manual-input"
                  />
                  <LoadingButton
                    label="Connect"
                    loadingLabel="Connecting…"
                    loading={addingProfile}
                    onPress={handleManualConnect}
                    testID="connect-manual-submit"
                    style={styles.manualButton}
                  />
                </View>
                {manualInputError ? (
                  <Text style={styles.manualError} testID="connect-manual-error">
                    {manualInputError}
                  </Text>
                ) : null}
              </View>

              {isDemoModeAllowed() ? (
                <View style={styles.demoEntry}>
                  <Text style={styles.demoEntryTitle}>Just exploring?</Text>
                  <Text style={styles.demoEntrySubtitle}>
                    Try Hermes with sample data — no computer required. You can connect a real
                    computer anytime from Settings.
                  </Text>
                  <LoadingButton
                    label="Explore in demo mode"
                    loadingLabel="Starting demo…"
                    loading={enablingDemo}
                    variant="secondary"
                    onPress={handleExploreDemo}
                    testID="connect-explore-demo"
                  />
                </View>
              ) : null}

              <Text style={styles.footnote}>
                Need Hermes on your computer first? Use the setup guide link in Settings after you dismiss
                this screen.
              </Text>
            </View>
          </ScrollView>
        </View>
      ) : null}

      <PairQrScannerModal
        visible={qrVisible}
        onClose={() => {
          setQrVisible(false);
          setInvalidQrHint(null);
        }}
        onScanned={async (params) => {
          await applySetupDeepLink(params);
          await retryGatewayBootstrap();
        }}
        onInvalidScan={() =>
          setInvalidQrHint('That QR is not a Hermes pairing code. Open Connect phone on your computer.')
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 11, 20, 0.96)',
    zIndex: 100,
  },
  cardScroll: {
    flex: 1,
  },
  cardScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 24,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    paddingTop: 4,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  hintError: {
    fontSize: 12,
    color: colors.error,
  },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 4,
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
  demoEntry: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 8,
  },
  demoEntryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  demoEntrySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
