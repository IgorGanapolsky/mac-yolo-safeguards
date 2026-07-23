import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useGateway } from '../context/GatewayContext';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { colors } from '../theme/colors';
import PairQrScannerModal from './PairQrScannerModal';
import TailscaleDiscoveryBanner from './TailscaleDiscoveryBanner';
import MacScanProgressCard from './MacScanProgressCard';
import GatewayProfilePicker from './GatewayProfilePicker';
import ManualComputerAddressForm from './ManualComputerAddressForm';
import LoadingButton from './ui/LoadingButton';
import { isLoopbackGatewayUrl } from '../utils/gatewayUrlPolicy';
import {
  profilesForDevicePicker,
  profilesForSwitchComputerPicker,
  synthesizeLiveUsbProfile,
  type LiveUsbPickerInput,
} from '../utils/gatewayProfilePicker';
import { isInvalidGatewayProfile } from '../services/gatewayProfiles';
import { probeLiveUsbGateway } from '../services/gatewayDiscovery';
import type { GatewayProfile } from '../types/gatewayProfile';
import {
  isE2eAutomationBuild,
  isStoreReviewDemoBuild,
  isDemoModeAllowed,
} from '../utils/demoModePolicy';
import { shouldShowConnectMacGate } from '../utils/freshUserOnboarding';
import {
  CONNECT_MAC_GATE_BODY_CELLULAR,
  CONNECT_MAC_GATE_BODY_WIFI,
  CONNECT_MAC_GATE_TITLE,
  GATE_SCAN_QR_LINK,
  GATE_SEARCHING_STATUS,
} from '../utils/tailscalePasteIpCopy';
import {
  USB_CABLE_GATE_BODY,
  USB_CABLE_GATE_TITLE,
  USB_PROBE_INTERVAL_MS,
  shouldAutoSelectLiveUsbOnGate,
  usbCableGateButtonLabel,
} from '../utils/usbCableGateOffer';
import { haptics } from '../services/haptics';

const AUTO_RETRY_MS = 12000;

const GATE_SURFACE = '#0F1321';

/**
 * First-run full-screen gate when no Mac is configured yet.
 * When USB reverse is live (phone → 127.0.0.1:8642), offer that cable as the primary CTA.
 * Otherwise stranger-first: paste Tailscale IP; Find computers / QR are secondary.
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
    addDiscoveredTailscaleComputer,
    probeTailscaleComputers,
    addGatewayProfile,
    patchSettings,
    wifiConnected,
  } = useGateway();

  const [qrVisible, setQrVisible] = useState(false);
  const [invalidQrHint, setInvalidQrHint] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [enablingDemo, setEnablingDemo] = useState(false);
  const [liveUsb, setLiveUsb] = useState<LiveUsbPickerInput | null>(null);
  const [usingUsb, setUsingUsb] = useState(false);
  const autoUsbAppliedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const { inset: keyboardInset } = useKeyboardInset({ focused: false });

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

  const handleManualProfileAdded = useCallback(
    async (label: string, gatewayUrl: string) => {
      await addGatewayProfile(label, gatewayUrl);
      await retryGatewayBootstrap();
    },
    [addGatewayProfile, retryGatewayBootstrap],
  );

  const handleSelectProfile = useCallback(
    async (profileId: string, profile: GatewayProfile) => {
      await selectGatewayProfile(profileId, { ensureProfile: profile });
      await retryGatewayBootstrap();
    },
    [retryGatewayBootstrap, selectGatewayProfile],
  );

  const handleUseUsbCable = useCallback(async () => {
    const hostname = liveUsb?.hostname?.trim();
    if (!liveUsb?.reachable || !hostname) {
      return;
    }
    setUsingUsb(true);
    try {
      const profile = synthesizeLiveUsbProfile(hostname);
      await selectGatewayProfile(profile.id, { ensureProfile: profile });
      await retryGatewayBootstrap();
      haptics.success();
    } catch {
      haptics.warning();
    } finally {
      setUsingUsb(false);
    }
  }, [liveUsb, retryGatewayBootstrap, selectGatewayProfile]);

  const hasSavedNonLoopbackMac = useMemo(
    () =>
      gatewayProfiles.some(
        (profile) =>
          !isInvalidGatewayProfile(profile) && !isLoopbackGatewayUrl(profile.gatewayUrl),
      ),
    [gatewayProfiles],
  );

  const pickerProfiles = useMemo(() => {
    const activeId = activeGatewayProfile?.id ?? null;
    const switchRows = profilesForSwitchComputerPicker(gatewayProfiles, {
      activeProfileId: activeId,
      liveUsb,
    });
    if (switchRows.length > 0) {
      return switchRows;
    }
    return profilesForDevicePicker(gatewayProfiles).filter(
      (profile) => !isLoopbackGatewayUrl(profile.gatewayUrl),
    );
  }, [activeGatewayProfile?.id, gatewayProfiles, liveUsb]);

  const searching =
    isSearching ||
    gatewayBootstrapPhase === 'booting' ||
    gatewayBootstrapPhase === 'searching' ||
    profileScanning;

  const showFreshGate = shouldShowConnectMacGate({
    bootstrapReady,
    demoMode: settings.demoMode,
    connectMacGateDismissed: settings.connectMacGateDismissed,
    profiles: gatewayProfiles,
    effectiveGatewayUrl,
    settingsGatewayUrl: settings.gatewayUrl,
    e2eAutomation: isE2eAutomationBuild(),
    storeReviewDemo: isStoreReviewDemoBuild(),
  });
  const keepFreshGateOpenDuringScanRef = useRef(false);
  if (showFreshGate) {
    keepFreshGateOpenDuringScanRef.current = true;
  } else if (!searching) {
    keepFreshGateOpenDuringScanRef.current = false;
  }
  const showGate =
    showFreshGate ||
    (!settings.connectMacGateDismissed && searching && keepFreshGateOpenDuringScanRef.current);

  const onCellular = !wifiConnected;
  const contextBody = onCellular ? CONNECT_MAC_GATE_BODY_CELLULAR : CONNECT_MAC_GATE_BODY_WIFI;
  const hasTailscaleCandidates = tailscaleDiscoveries.length > 0;
  const usbHostname = liveUsb?.hostname?.trim() ?? '';
  const showUsbOffer = Boolean(liveUsb?.reachable && usbHostname);

  const runWifiSearch = useCallback(async () => {
    setInvalidQrHint(null);
    setIsSearching(true);
    try {
      await scanForGatewayProfiles();
      await retryGatewayBootstrap();
    } finally {
      setIsSearching(false);
    }
  }, [retryGatewayBootstrap, scanForGatewayProfiles]);

  useEffect(() => {
    if (!showGate) {
      return;
    }
    void probeTailscaleComputers();
  }, [probeTailscaleComputers, showGate]);

  useEffect(() => {
    if (!showGate) {
      setLiveUsb(null);
      autoUsbAppliedRef.current = false;
      return;
    }
    let cancelled = false;
    const probe = async () => {
      try {
        const discovery = await probeLiveUsbGateway();
        if (cancelled) {
          return;
        }
        if (discovery?.hostname?.trim()) {
          setLiveUsb({ reachable: true, hostname: discovery.hostname });
          return;
        }
        setLiveUsb(discovery ? { reachable: true } : null);
      } catch {
        if (!cancelled) {
          setLiveUsb(null);
        }
      }
    };
    void probe();
    const timer = setInterval(() => {
      void probe();
    }, USB_PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showGate]);

  useEffect(() => {
    if (
      !shouldAutoSelectLiveUsbOnGate({
        liveUsbReachable: Boolean(liveUsb?.reachable),
        liveUsbHostname: liveUsb?.hostname,
        hasSavedNonLoopbackMac,
        alreadyApplied: autoUsbAppliedRef.current,
      })
    ) {
      return;
    }
    autoUsbAppliedRef.current = true;
    void handleUseUsbCable();
  }, [handleUseUsbCable, hasSavedNonLoopbackMac, liveUsb]);

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

  const showCompactScanStatus =
    !hasTailscaleCandidates &&
    !showUsbOffer &&
    searching &&
    !profileScanResult &&
    pickerProfiles.length === 0;

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
                <Text style={styles.title}>{CONNECT_MAC_GATE_TITLE}</Text>
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

              <Text style={styles.body}>{contextBody}</Text>

              {showUsbOffer ? (
                <View style={styles.usbOffer} testID="connect-mac-usb-offer">
                  <Text style={styles.usbOfferTitle}>{USB_CABLE_GATE_TITLE}</Text>
                  <Text style={styles.usbOfferBody}>{USB_CABLE_GATE_BODY}</Text>
                  <LoadingButton
                    label={usbCableGateButtonLabel(usbHostname)}
                    loadingLabel="Connecting…"
                    loading={usingUsb}
                    onPress={() => {
                      void handleUseUsbCable();
                    }}
                    testID="connect-mac-use-usb"
                  />
                </View>
              ) : null}

              <View style={styles.heroBlock} testID="connect-mac-onboarding-card">
                <ManualComputerAddressForm
                  heroMode
                  testIDPrefix="connect-manual"
                  onAddProfile={handleManualProfileAdded}
                />
              </View>

              {showCompactScanStatus ? (
                <Text style={styles.statusText} testID="connect-mac-scan-status">
                  {GATE_SEARCHING_STATUS}
                </Text>
              ) : null}

              {hasTailscaleCandidates ? (
                <TailscaleDiscoveryBanner
                  discoveries={tailscaleDiscoveries}
                  onAdd={addDiscoveredTailscaleComputer}
                  prominent={!showUsbOffer}
                />
              ) : null}

              {pickerProfiles.length > 0 ? (
                <View style={styles.foundBlock} testID="connect-mac-found-machines">
                  <Text style={styles.foundHeading}>Tap your Mac to connect</Text>
                  <GatewayProfilePicker
                    profiles={pickerProfiles}
                    activeProfileId={activeGatewayProfile?.id ?? null}
                    activeProfile={activeGatewayProfile}
                    liveUsb={liveUsb}
                    onSelect={(profileId, profile) => {
                      void handleSelectProfile(profileId, profile);
                    }}
                    wifiConnected={wifiConnected}
                    showReachabilityHints={pickerProfiles.length > 1}
                  />
                </View>
              ) : null}

              {!hasTailscaleCandidates &&
              !showUsbOffer &&
              (searching || profileScanResult) &&
              pickerProfiles.length === 0 ? (
                <MacScanProgressCard
                  scanning={searching}
                  progress={profileScanProgress}
                  result={profileScanResult}
                  connectableProfileCount={pickerProfiles.length}
                  testID="connect-mac-scan-progress"
                />
              ) : null}

              {!hasTailscaleCandidates || showUsbOffer ? (
                <View style={styles.secondaryRow}>
                  <LoadingButton
                    label="Find computers"
                    loadingLabel="Finding…"
                    loading={searching}
                    variant="secondary"
                    onPress={() => runWifiSearch()}
                    testID="connect-search-wifi"
                    style={styles.secondaryButton}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setInvalidQrHint(null);
                      setQrVisible(true);
                    }}
                    accessibilityRole="button"
                    testID="connect-scan-qr"
                  >
                    <Text style={styles.secondaryLink}>{GATE_SCAN_QR_LINK}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {invalidQrHint ? <Text style={styles.hintError}>{invalidQrHint}</Text> : null}

              {isDemoModeAllowed() ? (
                <View style={styles.demoEntry}>
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
    backgroundColor: GATE_SURFACE,
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
    backgroundColor: GATE_SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 24,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0.3,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    paddingTop: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  usbOffer: {
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.cardBg,
  },
  usbOfferTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text,
  },
  usbOfferBody: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  heroBlock: {
    gap: 0,
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
    color: colors.textMuted,
  },
  secondaryRow: {
    gap: 12,
    alignItems: 'stretch',
  },
  secondaryButton: {
    width: '100%',
  },
  secondaryLink: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  hintError: {
    fontSize: 12,
    color: colors.error,
  },
  demoEntry: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
