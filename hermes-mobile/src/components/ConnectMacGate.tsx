import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useGateway } from '../context/GatewayContext';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
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
import {
  profilesForDevicePicker,
  profilesForSwitchComputerPicker,
} from '../utils/gatewayProfilePicker';
import type { GatewayProfile } from '../types/gatewayProfile';
import {
  isE2eAutomationBuild,
  isStoreReviewDemoBuild,
  isDemoModeAllowed,
} from '../utils/demoModePolicy';
import { shouldShowConnectMacGate } from '../utils/freshUserOnboarding';
import { haptics } from '../services/haptics';

const AUTO_RETRY_MS = 12000;

/**
 * First-run full-screen gate when no Mac is configured yet.
 * Returning users with saved computers never see this — stay on Chat with
 * ChatConnectionPanel / header status (silent heal ~30s, then inline help).
 */
export default function ConnectMacGate() {
  const {
    settings,
    gatewayBootstrapPhase,
    bootstrapReady,
    profileScanning,
    profileScanProgress,
    profileScanResult,
    gatewayProfiles,
    activeGatewayProfile,
    effectiveGatewayUrl,
    applySetupDeepLink,
    retryGatewayBootstrap,
    scanForGatewayProfiles,
    selectGatewayProfile,
    tailscaleDiscoveries,
    tailscaleDiscoveryProbing,
    addDiscoveredTailscaleComputer,
    probeTailscaleComputers,
    addGatewayProfile,
    patchSettings,
    wifiConnected,
  } = useGateway();

  const [qrVisible, setQrVisible] = useState(false);
  const [invalidQrHint, setInvalidQrHint] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [manualInput, setManualInput] = useState('');
  const [addingProfile, setAddingProfile] = useState(false);
  const [manualInputError, setManualInputError] = useState<string | null>(null);
  const [enablingDemo, setEnablingDemo] = useState(false);
  const [manualInputFocused, setManualInputFocused] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { inset: keyboardInset } = useKeyboardInset({ focused: manualInputFocused });

  const handleDismiss = useCallback(async () => {
    try {
      await patchSettings({ connectMacGateDismissed: true });
      haptics.light();
    } catch {
      haptics.warning();
    }
  }, [patchSettings]);

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

  const handleSelectProfile = useCallback(
    async (profileId: string, profile: GatewayProfile) => {
      await selectGatewayProfile(profileId, { ensureProfile: profile });
      await retryGatewayBootstrap();
    },
    [retryGatewayBootstrap, selectGatewayProfile],
  );

  const pickerProfiles = useMemo(() => {
    const activeId = activeGatewayProfile?.id ?? null;
    const switchRows = profilesForSwitchComputerPicker(gatewayProfiles, {
      activeProfileId: activeId,
    });
    if (switchRows.length > 0) {
      return switchRows;
    }
    return profilesForDevicePicker(gatewayProfiles).filter(
      (profile) => !isLoopbackGatewayUrl(profile.gatewayUrl),
    );
  }, [activeGatewayProfile?.id, gatewayProfiles]);

  // First-run only. Saved Macs / transient Tailscale blips stay on Chat
  // (ChatConnectionPanel) — never re-mount this overlay on AppState or toggles.
  const showGate = shouldShowConnectMacGate({
    bootstrapReady,
    demoMode: settings.demoMode,
    connectMacGateDismissed: settings.connectMacGateDismissed,
    profiles: gatewayProfiles,
    effectiveGatewayUrl,
    settingsGatewayUrl: settings.gatewayUrl,
    e2eAutomation: isE2eAutomationBuild(),
    storeReviewDemo: isStoreReviewDemoBuild(),
  });

  const searching =
    isSearching ||
    gatewayBootstrapPhase === 'booting' ||
    gatewayBootstrapPhase === 'searching' ||
    profileScanning;

  const showMachineRows =
    pickerProfiles.length > 0 || (profileScanResult?.foundCount ?? 0) > 0;

  const onCellular = !wifiConnected;

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
      void handleDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [handleDismiss, showGate]);

  const primaryTailscaleLabel =
    tailscaleDiscoveries.length > 0
      ? tailscaleDiscoveryLabel(tailscaleDiscoveries[0])
      : undefined;

  return (
    <>
      {showGate ? (
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
          testID="connect-mac-gate"
        >
          <ScrollView
            ref={scrollRef}
            style={styles.cardScroll}
            contentContainerStyle={[
              styles.cardScrollContent,
              keyboardInset > 0 ? { paddingBottom: 24 + keyboardInset } : null,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.title}>Connect your computer</Text>
                <TouchableOpacity
                  onPress={() => {
                    void handleDismiss();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Not now"
                  testID="connect-mac-gate-dismiss"
                >
                  <Text style={styles.dismissText}>Not now</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.body}>
                {onCellular
                  ? 'Hermes on your phone talks to Hermes on your computer. On cellular, use Tailscale — we also search when you are on home Wi‑Fi.'
                  : 'Hermes on your phone talks to Hermes on your computer. Follow the steps below — we search your home Wi‑Fi automatically.'}
              </Text>

              <FreshUserOnboardingCard
                profiles={gatewayProfiles}
                tailscaleMacLabel={primaryTailscaleLabel}
                wifiConnected={wifiConnected}
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

              {showMachineRows && pickerProfiles.length > 0 ? (
                <View style={styles.foundBlock} testID="connect-mac-found-machines">
                  <Text style={styles.foundHeading}>Tap a computer to connect</Text>
                  <GatewayProfilePicker
                    profiles={pickerProfiles}
                    activeProfileId={activeGatewayProfile?.id ?? null}
                    onSelect={(profileId, profile) => {
                      void handleSelectProfile(profileId, profile);
                    }}
                    wifiConnected={wifiConnected}
                    showReachabilityHints={pickerProfiles.length > 1}
                  />
                </View>
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
                    onFocus={() => {
                      setManualInputFocused(true);
                      requestAnimationFrame(() => {
                        scrollRef.current?.scrollToEnd({ animated: true });
                      });
                    }}
                    onBlur={() => setManualInputFocused(false)}
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
                Need Hermes on your computer first? Open the setup guide from Settings — tap Not now
                above to use chat first.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0.5,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    paddingTop: 4,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  foundBlock: {
    gap: 8,
  },
  foundHeading: {
    fontSize: 13,
    fontWeight: '800',
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
