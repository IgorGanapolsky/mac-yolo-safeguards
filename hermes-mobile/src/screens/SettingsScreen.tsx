import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  Keyboard,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useGateway } from '../context/GatewayContext';
import GlassCard from '../components/GlassCard';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import { HERMES_MOBILE_CLOUD_URL, THUMBGATE_API_URL } from '../constants/appIdentity';
import { isGlassesConnected, launchHermesOnGlasses } from '../native/hermesGlasses';
import PairQrScannerModal from '../components/PairQrScannerModal';
import MacPairingHelp from '../components/MacPairingHelp';

import { isDemoModeAllowed } from '../utils/demoModePolicy';
import GatewayProfilePicker from '../components/GatewayProfilePicker';
import TailscaleDiscoveryBanner from '../components/TailscaleDiscoveryBanner';
import { profilesForSwitchComputerPicker, detectUsbHostMismatch } from '../utils/gatewayProfilePicker';
import { confirmForgetGatewayProfile } from '../utils/confirmForgetGatewayProfile';
import { profileDisplayName } from '../services/gatewayProfiles';
import { setProductAnalyticsOptOut } from '../services/productAnalytics';
import LoadingButton from '../components/ui/LoadingButton';
import { formatGatewayHostLabel, isPrivateLanGatewayUrl } from '../utils/gatewayEndpoint';
import { resolveRelayRouteDisplay, relayWorkerDisplayName } from '../utils/relayRouting';
import { isMacGatewayHttpOk } from '../utils/gatewayConnection';
import type { ApprovalPolicy } from '../types/gateway';
import GatewayOpsSection from '../components/GatewayOpsSection';
import { secureCredentials } from '../services/secureCredentials';
import { requestHermesNotificationPermission } from '../services/approvalNotifications';
import { deriveNotificationsEnabled } from '../utils/notificationPreferences';
import { consumeSettingsPairQrOnFocus } from '../utils/storeCaptureDeepLink';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const {
    settings,
    apiKey,
    health,
    effectiveGatewayUrl,
    isPaired,
    applySetupDeepLink,
    saveSettings,
    connectionState,
    autoConnectGateway,
    injectDemoApproval,
    completePair,
    disconnectPair,
    requestTestIntercept,
    relayWorkers,
    activeRelayWorkerId,
    gatewayProfiles: savedMacProfiles,
    activeGatewayProfile,
    profileScanning,
    profileScanProgress,
    profileScanResult,
    selectGatewayProfile,
    removeGatewayProfile,
    scanForGatewayProfiles,
    wifiConnected,
    tailscaleDiscoveries,
    tailscaleDiscoveryProbing,
    probeTailscaleComputers,
    addDiscoveredTailscaleComputer,
  } = useGateway();

  const [cloudUrl, setCloudUrl] = useState(settings.cloudUrl);
  const [connectionMode, setConnectionMode] = useState(settings.connectionMode);
  const [pairCode, setPairCode] = useState('');
  const [gatewayUrl, setGatewayUrl] = useState(settings.gatewayUrl);
  const [usePortal, setUsePortal] = useState(settings.usePortal);
  const [redactPii, setRedactPii] = useState(settings.redactPii);
  const [notificationApprovals, setNotificationApprovals] = useState(settings.notificationApprovals);
  const [notificationLiveRunStatus, setNotificationLiveRunStatus] = useState(
    settings.notificationLiveRunStatus,
  );
  const [notificationCompletion, setNotificationCompletion] = useState(settings.notificationCompletion);
  const [demoMode, setDemoMode] = useState(settings.demoMode);
  const [thumbgateApiUrl, setThumbgateApiUrl] = useState(settings.thumbgateApiUrl);
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicy>(settings.approvalPolicy);
  const [analyticsOptOut, setAnalyticsOptOut] = useState(settings.analyticsOptOut ?? false);
  const [includeToolActivity, setIncludeToolActivity] = useState(settings.includeToolActivity ?? false);
  const [inputThumbgateApiKey, setInputThumbgateApiKey] = useState('');
  const [inputApiKey, setInputApiKey] = useState(apiKey);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [isScanningMacs, setIsScanningMacs] = useState(false);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [glassesConnected, setGlassesConnected] = useState(false);

  const leaveSettings = useCallback(() => {
    Keyboard.dismiss();
    haptics.light();
    navigation.navigate('Chat' as never);
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      if (consumeSettingsPairQrOnFocus()) {
        setQrScannerVisible(true);
      }
    }, []),
  );

  // Android system back: dismiss QR first, otherwise leave Settings → Chat.
  // Never exit the app while the operator is mid-settings with no tab affordance.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return undefined;
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (qrScannerVisible) {
          setQrScannerVisible(false);
          return true;
        }
        leaveSettings();
        return true;
      });
      return () => subscription.remove();
    }, [leaveSettings, qrScannerVisible]),
  );

  const scrollRef = useRef<ScrollView>(null);
  const gatewayUrlInputRef = useRef<TextInput>(null);
  const relayRouteDisplay = useMemo(
    () =>
      resolveRelayRouteDisplay({
        connectionMode,
        isPaired,
        connectionState,
        workers: relayWorkers,
        activeWorkerId: activeRelayWorkerId,
        fallbackMachineLabel: effectiveGatewayUrl
          ? formatGatewayHostLabel(effectiveGatewayUrl, health)
          : 'Direct fallback',
        fallbackEndpoint: effectiveGatewayUrl || undefined,
      }),
    [
      activeRelayWorkerId,
      connectionMode,
      connectionState,
      effectiveGatewayUrl,
      health,
      isPaired,
      relayWorkers,
    ],
  );
  const macHttpOk = useMemo(() => isMacGatewayHttpOk(health), [health]);
  const activeGatewayUrl = effectiveGatewayUrl || gatewayUrl;
  const cellularBlocksDirect = useMemo(
    () => !wifiConnected && isPrivateLanGatewayUrl(activeGatewayUrl),
    [wifiConnected, activeGatewayUrl],
  );
  const usbHostMismatch = useMemo(
    () =>
      detectUsbHostMismatch({
        activeProfile: activeGatewayProfile,
        gatewayUrl: activeGatewayUrl,
        healthHostname: health?.hostname,
        profiles: savedMacProfiles,
        macHttpOk,
      }),
    [activeGatewayProfile, activeGatewayUrl, health?.hostname, savedMacProfiles, macHttpOk],
  );

  const anyNotificationEnabled =
    notificationApprovals || notificationLiveRunStatus || notificationCompletion;

  const ensureNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return true;
    }
    const granted = await requestHermesNotificationPermission();
    if (!granted) {
      Alert.alert(
        'Notifications blocked',
        'Enable notifications in system settings to get approval alerts and live run status while ThumbGate is in the background.',
      );
    }
    return granted;
  }, []);

  const handleNotificationToggle = useCallback(
    async (val: boolean, setter: (next: boolean) => void): Promise<void> => {
      if (val) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
          return;
        }
      }
      setter(val);
    },
    [ensureNotificationPermission],
  );

  const focusTunnelField = useCallback(() => {
    gatewayUrlInputRef.current?.focus();
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
      void probeTailscaleComputers();
      return () => cancelAnimationFrame(frame);
    }, [probeTailscaleComputers]),
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    isGlassesConnected().then(setGlassesConnected).catch(() => setGlassesConnected(false));
  }, []);

  // Sync state if context changes externally
  useEffect(() => {
    setCloudUrl(settings.cloudUrl);
    setConnectionMode(settings.connectionMode);
    setGatewayUrl(settings.gatewayUrl);
    setUsePortal(settings.usePortal);
    setRedactPii(settings.redactPii);
    setNotificationApprovals(settings.notificationApprovals);
    setNotificationLiveRunStatus(settings.notificationLiveRunStatus);
    setNotificationCompletion(settings.notificationCompletion);
    setDemoMode(settings.demoMode);
    setThumbgateApiUrl(settings.thumbgateApiUrl);
    setApprovalPolicy(settings.approvalPolicy ?? 'balanced');
    setAnalyticsOptOut(settings.analyticsOptOut ?? false);
    setProductAnalyticsOptOut(settings.analyticsOptOut ?? false);
    setIncludeToolActivity(settings.includeToolActivity ?? false);
  }, [settings]);

  useEffect(() => {
    secureCredentials.loadThumbgateApiKey().then((key) => setInputThumbgateApiKey(key ?? ''));
  }, []);

  useEffect(() => {
    setInputApiKey(apiKey);
  }, [apiKey]);

  const handleAutoConnect = async () => {
    haptics.selection();
    setIsAutoConnecting(true);
    try {
      const url = await autoConnectGateway();
      setGatewayUrl(url);
      haptics.success();
      if (!demoMode) {
        Alert.alert(
          'Connected',
          health?.level === 'green'
            ? `Direct local link healthy at ${url}`
            : `Using ${url}. If Chat still fails, turn on Tailscale or scan the QR from ThumbGate on your computer.`,
        );
      }
    } catch (err) {
      haptics.warning();
      if (!demoMode) {
        Alert.alert(
          'Auto-connect failed',
          err instanceof Error ? err.message : 'Could not reach a direct computer link.',
        );
      }
    } finally {
      setIsAutoConnecting(false);
    }
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    haptics.selection();
    setIsSaving(true);
    try {
      if (gatewayUrl?.trim()) {
        const trimmed = gatewayUrl.trim();
        const lower = trimmed.toLowerCase();
        if (
          lower === 'http' ||
          lower === 'https' ||
          lower === 'http://' ||
          lower === 'https://' ||
          lower === 'http:/' ||
          lower === 'https:/'
        ) {
          throw new Error('Please enter a valid URL (e.g. http://192.168.1.100:8642)');
        }
      }
      if (anyNotificationEnabled && Platform.OS !== 'web') {
        const granted = await ensureNotificationPermission();
        if (!granted) {
          setNotificationApprovals(false);
          setNotificationLiveRunStatus(false);
          setNotificationCompletion(false);
          setIsSaving(false);
          return;
        }
      }
      const notificationsEnabled = deriveNotificationsEnabled({
        notificationApprovals,
        notificationLiveRunStatus,
        notificationCompletion,
      });
      await saveSettings(
        {
          connectionMode,
          cloudUrl,
          gatewayUrl,
          usePortal,
          redactPii,
          notificationsEnabled,
          notificationApprovals,
          notificationLiveRunStatus,
          notificationCompletion,
          demoMode,
          glanceMode: settings.glanceMode,
          safetyMode: settings.safetyMode,
          thumbgateCaptureOnDown: settings.thumbgateCaptureOnDown,
          thumbgateCaptureOnUp: settings.thumbgateCaptureOnUp,
          thumbgateApiUrl,
          approvalPolicy,
          analyticsOptOut,
          includeToolActivity,
          thumbgateProActive: settings.thumbgateProActive,
        },
        inputApiKey,
        inputThumbgateApiKey,
      );
      haptics.success();
      Alert.alert('Success', 'Gateway settings updated successfully.');
    } catch (err) {
      haptics.warning();
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDemo = (value: boolean) => {
    setDemoMode(value);
  };

  const handlePair = async () => {
    Keyboard.dismiss();
    if (!pairCode.trim()) {
      Alert.alert('Pairing code required', 'On your computer, open ThumbGate pairing and enter the code it shows you.');
      return;
    }
    try {
      // Verify the relay pairing succeeds BEFORE persisting connectionMode: 'relay'.
      // A failed pair (e.g. relay resource_exhausted) must never flip the app into relay
      // mode with no valid token — that silently breaks working USB/Tailscale gateway
      // profiles until the user notices and manually switches back (P0 2026-07-14).
      await completePair(pairCode);
      await saveSettings(
        {
          connectionMode: 'relay',
          cloudUrl,
          gatewayUrl,
          usePortal,
          redactPii,
          notificationsEnabled: deriveNotificationsEnabled({
            notificationApprovals,
            notificationLiveRunStatus,
            notificationCompletion,
          }),
          notificationApprovals,
          notificationLiveRunStatus,
          notificationCompletion,
          demoMode: false,
          glanceMode: settings.glanceMode,
          safetyMode: settings.safetyMode,
          thumbgateCaptureOnDown: settings.thumbgateCaptureOnDown,
          thumbgateCaptureOnUp: settings.thumbgateCaptureOnUp,
          thumbgateApiUrl,
          approvalPolicy,
          analyticsOptOut,
          includeToolActivity,
          thumbgateProActive: settings.thumbgateProActive,
        },
        inputApiKey,
      );
      setPairCode('');
      Alert.alert(
        'Cloud approvals paired',
        'Approval requests can arrive anywhere. This does not provide live Chat or computer tools; connect to your computer with Tailscale, USB, or home Wi‑Fi.',
      );
    } catch (err) {
      Alert.alert('Pairing failed', err instanceof Error ? err.message : 'Could not complete pairing');
    }
  };

  const handleTestIntercept = async () => {
    try {
      await requestTestIntercept();
      Alert.alert('Test sent', 'Check ThumbGate Leash for a fake agent tool approval.');
    } catch (err) {
      Alert.alert('Test failed', err instanceof Error ? err.message : 'Could not inject test event');
    }
  };
  const handleFindMacs = async () => {
    haptics.selection();
    setIsScanningMacs(true);
    try {
      await scanForGatewayProfiles();
    } catch (err) {
      haptics.warning();
      if (!demoMode) {
        Alert.alert(
          'Scan failed',
          err instanceof Error ? err.message : 'Could not search for ThumbGate computers.',
        );
      }
    } finally {
      setIsScanningMacs(false);
    }
  };

  const handleSelectProfile = async (
    profileId: string,
    profile?: import('../types/gatewayProfile').GatewayProfile,
  ) => {
    try {
      const ok = await selectGatewayProfile(profileId, { ensureProfile: profile });
      if (!ok && !demoMode) {
        Alert.alert('Switch failed', 'Could not connect to that computer. Try Find computers.');
      }
    } catch (err) {
      haptics.warning();
      if (!demoMode) {
        Alert.alert(
          'Switch failed',
          err instanceof Error ? err.message : 'Could not connect to that computer.',
        );
      }
    }
  };

  const handleRemoveProfile = (profileId: string) => {
    const profile = savedMacProfiles.find((p) => p.id === profileId);
    const computerName = profile ? profileDisplayName(profile) : 'this computer';
    confirmForgetGatewayProfile({
      profileId,
      computerName,
      onConfirm: removeGatewayProfile,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title} testID="SETTINGS">SETTINGS</Text>
          <TouchableOpacity
            onPress={leaveSettings}
            accessibilityRole="button"
            accessibilityLabel="Done — return to ThumbGate chat"
            testID="settings-done"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Connect your computer with Tailscale or home Wi‑Fi, then manage machines and ops</Text>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent}>

        <Text style={styles.sectionTitle}>📊 Privacy</Text>
        <GlassCard>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.label}>Product analytics</Text>
              <Text style={styles.description}>
                Anonymous usage events (screen views, computer scan results) via PostHog. No chat content.
              </Text>
            </View>
            <Switch
              value={!analyticsOptOut}
              onValueChange={(enabled) => {
                setAnalyticsOptOut(!enabled);
                setProductAnalyticsOptOut(!enabled);
              }}
              testID="analytics-opt-in-switch"
            />
          </View>
        </GlassCard>

        <Text style={styles.sectionTitle}>ThumbGate Machines</Text>
        {cellularBlocksDirect ? (
          <GlassCard style={styles.tunnelWizardCard} testID="settings-cellular-tunnel-banner">
            <Text style={styles.tunnelWizardTitle} testID="settings-tunnel-wizard-title">
              Cellular — tunnel required
            </Text>
            <Text style={styles.description} testID="settings-tunnel-wizard-body">
              Your saved computer uses a private Wi‑Fi address. On cellular, Chat needs a tunnel URL
              pointing at ThumbGate port 8642 on your computer.
            </Text>
            <Text style={styles.tunnelStep} testID="settings-tunnel-step-1">
              1. On your computer, expose ThumbGate on port 8642 — Tailscale MagicDNS, ngrok, or Cloudflare
              Tunnel.
            </Text>
            <Text style={styles.tunnelStep} testID="settings-tunnel-step-2">
              2. Example: http://mac-mini.your-tailnet.ts.net:8642 or http://100.x.x.x:8642
            </Text>
            <Text style={styles.tunnelStep} testID="settings-tunnel-step-3">
              3. Paste the URL below in Advanced — Direct URL / Tunnel, then save.
            </Text>
            <Text style={styles.tunnelExample} testID="settings-tunnel-example-url">
              http://100.x.x.x:8642
            </Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={focusTunnelField}
              testID="settings-tunnel-field-link"
            >
              <Text style={styles.secondaryButtonText}>Go to tunnel URL field</Text>
            </TouchableOpacity>
          </GlassCard>
        ) : null}
        {usbHostMismatch ? (
          <GlassCard style={styles.usbMismatchCard} testID="settings-usb-host-mismatch">
            <Text style={styles.tunnelWizardTitle}>Wrong computer on USB</Text>
            <Text style={styles.description}>
              USB is connected to {usbHostMismatch.usbHostLabel}, but you selected{' '}
              {usbHostMismatch.selectedProfileLabel}. Tap the matching computer below.
            </Text>
          </GlassCard>
        ) : null}
        <TailscaleDiscoveryBanner
          discoveries={tailscaleDiscoveries}
          onAdd={(discovery) => {
            void addDiscoveredTailscaleComputer(discovery);
          }}
        />
        <GlassCard>
          <Text style={styles.label}>Your active machines</Text>
          <Text style={styles.description}>
            Away from home, use Tailscale so your phone can reach your computer. On home Wi‑Fi,
            Find computers works without a tunnel. Saved machines power Chat, tools, and ops.
          </Text>
          <GatewayProfilePicker
            profiles={profilesForSwitchComputerPicker(savedMacProfiles)}
            activeProfileId={activeGatewayProfile?.id ?? null}
            activeProfile={activeGatewayProfile}
            activeReachable={macHttpOk}
            authNeedsRepair={health?.authMismatch === true}
            activeConnecting={connectionState === 'connecting'}
            onSelect={handleSelectProfile}
            onRemove={handleRemoveProfile}
            scanning={profileScanning || isScanningMacs}
            scanProgress={profileScanProgress}
            scanResult={profileScanResult}
            wifiConnected={wifiConnected}
            showReachabilityHints
          />
          <LoadingButton
            label="Search local network"
            loadingLabel="Searching locally…"
            loading={isScanningMacs || profileScanning}
            onPress={handleFindMacs}
            testID="find-macs-on-wifi"
            style={styles.pairButton}
          />
          <Text style={styles.description}>
            ThumbGate on your computer must be running. Find computers searches home Wi‑Fi and Tailscale.
          </Text>
          <MacPairingHelp variant="getting-started" compact testID="settings-mac-pairing-help" />
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleAutoConnect}
            disabled={isAutoConnecting}
            testID="auto-connect-gateway"
          >
            <Text style={styles.primaryButtonText}>
              {isAutoConnecting ? 'Connecting…' : 'Find computer on USB or Wi‑Fi'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pairButton}
            onPress={() => setQrScannerVisible(true)}
            testID="scan-pairing-qr"
          >
            <Text style={styles.pairButtonText}>Scan local QR from computer</Text>
          </TouchableOpacity>
          {effectiveGatewayUrl ? (
            <Text style={styles.metaLine}>
              Active: {formatGatewayHostLabel(effectiveGatewayUrl, health)}
              {health?.level === 'green' ? ' · healthy' : ''}
            </Text>
          ) : null}
          <View style={styles.spacer} />
          <Text style={styles.label}>Advanced — Direct URL / Tunnel</Text>
          <Text style={styles.description}>
            Only for direct Chat/ops fallback. Paste Tailscale, ngrok, Cloudflare, or LAN IP (port
            8642). Required on cellular when your saved profile uses a private Wi‑Fi address.
          </Text>
          <TextInput
            ref={gatewayUrlInputRef}
            testID="gateway-url-input"
            style={styles.input}
            value={gatewayUrl}
            onChangeText={setGatewayUrl}
            placeholder="https://xxxx.ngrok-free.app"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.spacer} />
          <Text style={styles.label}>Direct Link API Key</Text>
          <TextInput
            testID="gateway-api-key-input"
            style={styles.input}
            value={inputApiKey}
            onChangeText={setInputApiKey}
            placeholder="sk-..."
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.description}>
            Stored in the device keychain. Required for direct Chat tab session APIs.
          </Text>
        </GlassCard>

        <View testID="GATEWAY_OPS" accessible={true}>
          <Text style={styles.sectionTitle}>Computer gateway ops</Text>
        </View>
        <Text style={styles.description}>
          Toolsets, cron jobs, and skills from your computer (Tailscale, home Wi‑Fi, or USB).
        </Text>
        <GatewayOpsSection />

        <Text style={styles.sectionTitle}>Computer connection</Text>
        <GlassCard>
          <Text style={styles.description}>
            Use Tailscale away from home, or USB/home Wi‑Fi nearby, for Chat, tools, and ops.
          </Text>
          <View style={styles.relayRouteCard} testID="relay-route-card">
            <Text style={styles.relayRouteEyebrow}>Cloud approvals (optional)</Text>
            <Text style={styles.relayRouteTitle} testID="relay-route-title">
              {relayRouteDisplay.machineLabel}
            </Text>
            <Text style={styles.relayRouteMeta} testID="relay-route-status">
              {relayRouteDisplay.routeStatus}
              {relayRouteDisplay.endpointLabel ? ` · ${relayRouteDisplay.endpointLabel}` : ''}
            </Text>
          </View>
          {relayWorkers.length > 0 ? (
            <View style={styles.workerList} testID="relay-worker-list">
              {relayWorkers.slice(0, 4).map((worker) => {
                const active =
                  worker.id === activeRelayWorkerId || worker.machine_id === activeRelayWorkerId;
                return (
                  <View
                    key={worker.id}
                    style={[styles.workerRow, active && styles.workerRowActive]}
                    testID={`relay-worker-${worker.id}`}
                  >
                    <View
                      style={[
                        styles.workerDot,
                        {
                          backgroundColor: /online|active|busy|running/i.test(worker.status ?? '')
                            ? colors.success
                            : colors.textMuted,
                        },
                      ]}
                    />
                    <Text style={styles.workerName} numberOfLines={1}>
                      {relayWorkerDisplayName(worker)}
                    </Text>
                    {worker.status ? (
                      <Text style={styles.workerStatus} numberOfLines={1}>
                        {worker.status}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
          <View style={styles.spacer} />
          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Cloud approvals (optional)</Text>
              <Text style={styles.switchDesc}>
                Pair your ThumbGate account for approval requests anywhere. Does not provide live Chat or computer tools.
              </Text>
            </View>
            <Switch
              value={connectionMode === 'relay'}
              onValueChange={(val) => {
                setConnectionMode(val ? 'relay' : 'gateway');
              }}
              testID="approval-relay-mode-switch"
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={connectionMode === 'relay' ? '#ffffff' : '#9CA3AF'}
            />
          </View>
          {connectionMode === 'gateway' ? (
            <Text style={styles.description}>
              Direct mode listens on WebSocket /v1/events at the URL above; tunnel required off-network.
            </Text>
          ) : null}
          <View style={styles.divider} />
          <Text style={styles.label}>Cloud approvals URL (advanced)</Text>
          <TextInput
            style={styles.input}
            value={cloudUrl}
            onChangeText={setCloudUrl}
            placeholder={HERMES_MOBILE_CLOUD_URL}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.spacer} />
          <Text style={styles.label}>Pairing code</Text>
          <TextInput
            style={styles.input}
            value={pairCode}
            onChangeText={setPairCode}
            placeholder="MOON-DUST"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.pairButton} onPress={handlePair}>
            <Text style={styles.pairButtonText}>
              {isPaired ? 'RE-LINK WITH NEW CODE' : 'PAIR WITH COMPUTER'}
            </Text>
          </TouchableOpacity>
          {isPaired ? (
            <>
              <Text style={styles.pairedText}>Paired — mobile token stored in secure storage.</Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleTestIntercept}>
                <Text style={styles.secondaryButtonText}>⚡ Send test approval to ThumbGate Leash</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.unlinkButton} onPress={() => disconnectPair()}>
                <Text style={styles.unlinkButtonText}>Disconnect pairing</Text>
              </TouchableOpacity>
            </>
          ) : null}
          <View style={styles.divider} />
          <Text style={styles.label}>ThumbGate API URL</Text>
          <TextInput
            style={styles.input}
            value={thumbgateApiUrl}
            onChangeText={setThumbgateApiUrl}
            placeholder={THUMBGATE_API_URL}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.spacer} />
          <Text style={styles.label}>ThumbGate API key (hosted)</Text>
          <TextInput
            style={styles.input}
            value={inputThumbgateApiKey}
            onChangeText={setInputThumbgateApiKey}
            placeholder="Bearer token for /v1/feedback/capture"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.description}>
            Required for cloud ThumbGate memory capture. Local `npx thumbgate start-api` may work
            without a key on LAN.
          </Text>
        </GlassCard>

        <Text style={styles.sectionTitle}>Notification preferences</Text>
        <GlassCard>
          <Text style={styles.switchDesc}>
            Heads-up banners are reserved for approvals only. Live run and completion stay in the
            quiet status shade — never pop when you leave the app. Turn each category off anytime.
          </Text>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Approval heads-up</Text>
              <Text style={styles.switchDesc}>
                Only high-value lock-screen alerts with Approve and Deny. Off = no pop.
              </Text>
            </View>
            <Switch
              testID="notification-approvals-switch"
              value={notificationApprovals}
              onValueChange={(val) => {
                void handleNotificationToggle(val, setNotificationApprovals);
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={notificationApprovals ? '#ffffff' : '#9CA3AF'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Live run status (quiet)</Text>
              <Text style={styles.switchDesc}>
                Optional quiet shade while a run is active. Off by default — does not heads-up.
              </Text>
            </View>
            <Switch
              testID="notification-live-run-switch"
              value={notificationLiveRunStatus}
              onValueChange={(val) => {
                void handleNotificationToggle(val, setNotificationLiveRunStatus);
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={notificationLiveRunStatus ? '#ffffff' : '#9CA3AF'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Completion / failure (quiet)</Text>
              <Text style={styles.switchDesc}>
                Quiet shade when a background task finishes or fails. Never a heads-up banner.
              </Text>
            </View>
            <Switch
              testID="notification-completion-switch"
              value={notificationCompletion}
              onValueChange={(val) => {
                void handleNotificationToggle(val, setNotificationCompletion);
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={notificationCompletion ? '#ffffff' : '#9CA3AF'}
            />
          </View>
        </GlassCard>

        {/* Safeguard Options */}
        <Text style={styles.sectionTitle}>🛡 Safeguard Rules</Text>
        <GlassCard>
          <Text style={styles.switchLabel}>Approval policy</Text>
          <Text style={styles.switchDesc}>
            Strict hides “always allow” and gates prod deploy. Autonomous defers to computer standing approvals.
          </Text>
          <View style={styles.policyRow}>
            {(['strict', 'balanced', 'autonomous'] as ApprovalPolicy[]).map((policy) => (
              <TouchableOpacity
                key={policy}
                style={[
                  styles.policyChip,
                  approvalPolicy === policy && styles.policyChipActive,
                ]}
                onPress={() => {
                  haptics.selection();
                  setApprovalPolicy(policy);
                }}
                testID={`approval-policy-${policy}`}
              >
                <Text
                  style={[
                    styles.policyChipText,
                    approvalPolicy === policy && styles.policyChipTextActive,
                  ]}
                >
                  {policy}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Use Portal Tunnel</Text>
              <Text style={styles.switchDesc}>Route actions through Gateway Portal</Text>
            </View>
            <Switch
              value={usePortal}
              onValueChange={(val) => {
                setUsePortal(val);
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={usePortal ? '#ffffff' : '#9CA3AF'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Redact PII & Secrets</Text>
              <Text style={styles.switchDesc}>Mask API keys and credentials in diffs</Text>
            </View>
            <Switch
              value={redactPii}
              onValueChange={(val) => {
                setRedactPii(val);
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={redactPii ? '#ffffff' : '#9CA3AF'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Show Tool Activity</Text>
              <Text style={styles.switchDesc}>
                Render completed tool execution messages (e.g., ⚙️ computer_use...) in transcripts
              </Text>
            </View>
            <Switch
              value={includeToolActivity}
              onValueChange={(val) => {
                setIncludeToolActivity(val);
              }}
              testID="tool-activity-switch"
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={includeToolActivity ? '#ffffff' : '#9CA3AF'}
            />
          </View>
        </GlassCard>

        {Platform.OS === 'android' ? (
          <>
            <Text style={styles.sectionTitle}>🕶️ AI glasses</Text>
            <GlassCard>
              <Text style={styles.description}>
                Launch the native projected ThumbGate Leash activity on paired AI glasses. Currently supports
                Jetpack XR on Android (emulator or hardware). Other platforms coming. Requires
                prebuild with the XR config plugin.
              </Text>
              <TouchableOpacity
                style={[
                  styles.pairButton,
                  !glassesConnected && styles.saveButtonDisabled,
                ]}
                disabled={!glassesConnected}
                testID="launch-on-glasses-button"
                onPress={async () => {
                  try {
                    await launchHermesOnGlasses();
                    haptics.success();
                  } catch (err) {
                    Alert.alert(
                      'Glasses launch failed',
                      err instanceof Error ? err.message : 'Could not launch projected activity',
                    );
                  }
                }}
              >
                <Text style={styles.pairButtonText}>
                  {glassesConnected ? 'LAUNCH LEASH ON GLASSES' : 'GLASSES NOT CONNECTED'}
                </Text>
              </TouchableOpacity>
            </GlassCard>
          </>
        ) : null}

        {isDemoModeAllowed() ? (
          <>
            <Text style={styles.sectionTitle}>🧪 Developer Tools</Text>
            <GlassCard>
              <View style={styles.switchRow}>
                <View style={styles.switchLabelCol}>
                  <Text style={styles.switchLabel}>Demo mode</Text>
                  <Text style={styles.switchDesc}>Simulate approvals without a running server</Text>
                </View>
                <Switch
                  value={demoMode}
                  onValueChange={handleToggleDemo}
                  testID="demo-mode-switch"
                  trackColor={{ false: '#1F2937', true: colors.primary }}
                  thumbColor={demoMode ? '#ffffff' : '#9CA3AF'}
                />
              </View>

              {demoMode ? (
                <TouchableOpacity
                  style={styles.demoButton}
                  onPress={() => {
                    injectDemoApproval();
                  }}
                  testID="inject-mock-approval"
                >
                  <Text style={styles.demoButtonText}>⚡ Inject Mock Approval Request</Text>
                </TouchableOpacity>
              ) : null}
            </GlassCard>
          </>
        ) : null}

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          testID="save-settings-button"
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'SAVING CONFIG...' : 'SAVE CONFIGURATION'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          ThumbGate v0.1.0 • {connectionMode === 'relay' ? 'Relay' : 'WS'}: {connectionState}
          {isPaired ? ' • paired' : ''}
        </Text>
      </ScrollView>
      <PairQrScannerModal
        visible={qrScannerVisible}
        onClose={() => setQrScannerVisible(false)}
        onScanned={applySetupDeepLink}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundStart,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 2,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 14,
  },
  description: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
  },
  spacer: {
    height: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabelCol: {
    flex: 1,
    paddingRight: 16,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  switchDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 8,
  },
  policyRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  policyChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  policyChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  policyChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
  policyChipTextActive: {
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 12,
  },
  relayRouteCard: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  relayRouteEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  relayRouteTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  relayRouteMeta: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
  },
  workerList: {
    marginTop: 10,
    gap: 6,
  },
  workerRow: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255,255,255,0.035)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  workerRowActive: {
    borderColor: colors.success,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  workerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  workerName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  workerStatus: {
    maxWidth: 92,
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  demoButton: {
    marginTop: 16,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  demoButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  pairButton: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pairButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0.5,
  },
  pairedText: {
    marginTop: 12,
    fontSize: 11,
    color: colors.success,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  metaLine: {
    fontSize: 11,
    color: colors.secondary,
    marginTop: 8,
  },
  tunnelWizardCard: {
    marginBottom: 12,
    borderColor: colors.warning,
    borderWidth: 1,
  },
  usbMismatchCard: {
    marginBottom: 12,
    borderColor: colors.warning,
    borderWidth: 1,
  },
  tunnelWizardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.warning,
    marginBottom: 8,
  },
  tunnelStep: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 6,
  },
  tunnelExample: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.accent,
    fontWeight: '700',
  },
  unlinkButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  unlinkButtonText: {
    fontSize: 11,
    color: colors.error,
    fontWeight: '700',
  },
  saveButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 1,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 24,
  },
});
