import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useGateway } from '../context/GatewayContext';
import GlassCard from '../components/GlassCard';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import { HERMES_MOBILE_CLOUD_URL, THUMBGATE_API_URL } from '../constants/appIdentity';
import { THUMBGATE_PRO_PRICE_LABEL } from '../constants/monetization';
import { isGlassesConnected, launchHermesOnGlasses } from '../native/hermesGlasses';
import PairQrScannerModal from '../components/PairQrScannerModal';
import MacPairingHelp from '../components/MacPairingHelp';
import ProUpgradeCard from '../components/ProUpgradeCard';
import { isDemoModeAllowed } from '../utils/demoModePolicy';
import GatewayProfilePicker from '../components/GatewayProfilePicker';
import { setProductAnalyticsOptOut } from '../services/productAnalytics';
import LoadingButton from '../components/ui/LoadingButton';
import { formatGatewayHostLabel } from '../utils/gatewayEndpoint';
import type { ApprovalPolicy, HermesAvatar, HermesPersona } from '../types/gateway';
import GatewayOpsSection from '../components/GatewayOpsSection';
import { secureCredentials } from '../services/secureCredentials';
import { requestHermesNotificationPermission } from '../services/approvalNotifications';
import { AVATARS, PERSONAS } from '../utils/hermesPersona';

export default function SettingsScreen() {
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
    injectSmokeApproval,
    completePair,
    disconnectPair,
    requestTestIntercept,
    gatewayProfiles: savedMacProfiles,
    activeGatewayProfile,
    profileScanning,
    profileScanProgress,
    profileScanResult,
    selectGatewayProfile,
    removeGatewayProfile,
    scanForGatewayProfiles,
  } = useGateway();

  const [cloudUrl, setCloudUrl] = useState(settings.cloudUrl);
  const [connectionMode, setConnectionMode] = useState(settings.connectionMode);
  const [pairCode, setPairCode] = useState('');
  const [gatewayUrl, setGatewayUrl] = useState(settings.gatewayUrl);
  const [usePortal, setUsePortal] = useState(settings.usePortal);
  const [redactPii, setRedactPii] = useState(settings.redactPii);
  const [notificationsEnabled, setNotificationsEnabled] = useState(settings.notificationsEnabled);
  const [demoMode, setDemoMode] = useState(settings.demoMode);
  const [glanceMode, setGlanceMode] = useState(settings.glanceMode);
  const [safetyMode, setSafetyMode] = useState(settings.safetyMode);
  const [thumbgateCaptureOnDown, setThumbgateCaptureOnDown] = useState(settings.thumbgateCaptureOnDown);
  const [thumbgateCaptureOnUp, setThumbgateCaptureOnUp] = useState(settings.thumbgateCaptureOnUp);
  const [thumbgateApiUrl, setThumbgateApiUrl] = useState(settings.thumbgateApiUrl);
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicy>(settings.approvalPolicy);
  const [analyticsOptOut, setAnalyticsOptOut] = useState(settings.analyticsOptOut ?? false);
  const [includeToolActivity, setIncludeToolActivity] = useState(settings.includeToolActivity ?? true);
  const [hermesPersona, setHermesPersona] = useState<HermesPersona>(
    settings.hermesPersona ?? 'operator',
  );
  const [hermesAvatar, setHermesAvatar] = useState<HermesAvatar>(
    settings.hermesAvatar ?? 'orb',
  );
  const [playfulMotion, setPlayfulMotion] = useState(settings.playfulMotion ?? true);
  const [inputThumbgateApiKey, setInputThumbgateApiKey] = useState('');
  const [inputApiKey, setInputApiKey] = useState(apiKey);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [isScanningMacs, setIsScanningMacs] = useState(false);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [glassesConnected, setGlassesConnected] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
      return () => cancelAnimationFrame(frame);
    }, []),
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
    setNotificationsEnabled(settings.notificationsEnabled);
    setDemoMode(settings.demoMode);
    setGlanceMode(settings.glanceMode);
    setSafetyMode(settings.safetyMode);
    setThumbgateCaptureOnDown(settings.thumbgateCaptureOnDown);
    setThumbgateCaptureOnUp(settings.thumbgateCaptureOnUp);
    setThumbgateApiUrl(settings.thumbgateApiUrl);
    setApprovalPolicy(settings.approvalPolicy ?? 'balanced');
    setAnalyticsOptOut(settings.analyticsOptOut ?? false);
    setProductAnalyticsOptOut(settings.analyticsOptOut ?? false);
    setIncludeToolActivity(settings.includeToolActivity ?? true);
    setHermesPersona(settings.hermesPersona ?? 'operator');
    setHermesAvatar(settings.hermesAvatar ?? 'orb');
    setPlayfulMotion(settings.playfulMotion ?? true);
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
            ? `Gateway healthy at ${url}`
            : `Using ${url}. If Chat still fails, tap Find computers on Wi‑Fi or scan the QR from Hermes on your computer.`,
        );
      }
    } catch (err) {
      haptics.warning();
      if (!demoMode) {
        Alert.alert(
          'Auto-connect failed',
          err instanceof Error ? err.message : 'Could not reach your computer gateway on LAN.',
        );
      }
    } finally {
      setIsAutoConnecting(false);
    }
  };

  const unlockThumbgateLeash = async () => {
    await saveSettings({ ...settings, thumbgateProActive: true }, apiKey);
    haptics.success();
    if (!isDemoModeAllowed()) {
      Alert.alert('Unlocked', 'ThumbGate Leash is active on this phone.');
    }
  };

  const requireLeashPro = (featureLabel: string): boolean => {
    if (settings.thumbgateProActive) {
      return true;
    }
    Alert.alert(
      'ThumbGate Pro required',
      `${featureLabel} is part of ThumbGate Leash (${THUMBGATE_PRO_PRICE_LABEL}). Subscribe below, then tap unlock.`,
    );
    return false;
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    haptics.selection();
    setIsSaving(true);
    try {
      if (notificationsEnabled && Platform.OS !== 'web') {
        const granted = await requestHermesNotificationPermission();
        if (!granted) {
          setNotificationsEnabled(false);
          Alert.alert(
            'Notifications blocked',
            'Enable notifications in system settings to get approval alerts and live activity while Hermes is in the background.',
          );
          setIsSaving(false);
          return;
        }
      }
      await saveSettings(
        {
          connectionMode,
          cloudUrl,
          gatewayUrl,
          usePortal,
          redactPii,
          notificationsEnabled,
          demoMode,
          glanceMode,
          safetyMode,
          thumbgateCaptureOnDown,
          thumbgateCaptureOnUp,
          thumbgateApiUrl,
          approvalPolicy,
          analyticsOptOut,
          includeToolActivity,
          hermesPersona,
          hermesAvatar,
          playfulMotion,
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
      Alert.alert('Pairing code required', 'Run bridge pairing on your computer and enter the code Hermes shows you.');
      return;
    }
    try {
      await saveSettings(
        {
          connectionMode: 'relay',
          cloudUrl,
          gatewayUrl,
          usePortal,
          redactPii,
          notificationsEnabled,
          demoMode: false,
          glanceMode,
          safetyMode,
          thumbgateCaptureOnDown,
          thumbgateCaptureOnUp,
          thumbgateApiUrl,
          approvalPolicy,
          analyticsOptOut,
          includeToolActivity,
          hermesPersona,
          hermesAvatar,
          playfulMotion,
          thumbgateProActive: settings.thumbgateProActive,
        },
        inputApiKey,
      );
      await completePair(pairCode);
      setPairCode('');
      Alert.alert('Paired', 'Hermes Mobile ThumbGate Leash is linked to your computer approval relay.');
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
          err instanceof Error ? err.message : 'Could not search for computer gateways.',
        );
      }
    } finally {
      setIsScanningMacs(false);
    }
  };

  const handleSelectProfile = async (profileId: string) => {
    try {
      await selectGatewayProfile(profileId);
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
    Alert.alert('Remove computer', 'Remove this saved computer from the list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeGatewayProfile(profileId),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title} testID="SETTINGS">SETTINGS</Text>
        <Text style={styles.subtitle}>Connect your computer, run Mac gateway ops, ThumbGate Leash relay</Text>
        <TouchableOpacity
          style={styles.gatewayOpsShortcut}
          onPress={() => scrollRef.current?.scrollTo({ y: 520, animated: true })}
          testID="GATEWAY_OPS"
          accessibilityRole="button"
          accessibilityLabel="Jump to Mac gateway ops"
        >
          <Text style={styles.gatewayOpsShortcutText}>Mac gateway ops</Text>
          <Text style={styles.gatewayOpsShortcutHint}>Tools, jobs, and skills</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>💎 ThumbGate Leash (Pro)</Text>
        <GlassCard>
          <ProUpgradeCard
            onUnlocked={unlockThumbgateLeash}
            onTesterUnlock={
              __DEV__ || isDemoModeAllowed() ? unlockThumbgateLeash : undefined
            }
          />
        </GlassCard>

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

        <Text style={styles.sectionTitle}>✨ Hermes personality</Text>
        <GlassCard>
          <Text style={styles.label}>Persona</Text>
          <Text style={styles.description}>
            Give Hermes a Character-style feel without changing its safety or execution boundaries.
          </Text>
          <View style={styles.choiceGrid}>
            {PERSONAS.map((persona) => {
              const active = hermesPersona === persona.key;
              return (
                <TouchableOpacity
                  key={persona.key}
                  style={[styles.personaChip, active && styles.personaChipActive]}
                  onPress={() => setHermesPersona(persona.key)}
                  testID={`persona-${persona.key}`}
                >
                  <Text style={[styles.personaChipText, active && styles.personaChipTextActive]}>
                    {persona.label}
                  </Text>
                  <Text style={styles.personaChipDesc}>{persona.tagline}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.divider} />

          <Text style={styles.label}>Avatar</Text>
          <View style={styles.avatarGrid}>
            {AVATARS.map((avatar) => {
              const active = hermesAvatar === avatar.key;
              return (
                <TouchableOpacity
                  key={avatar.key}
                  style={[styles.avatarChip, active && styles.avatarChipActive]}
                  onPress={() => setHermesAvatar(avatar.key)}
                  testID={`avatar-${avatar.key}`}
                >
                  <Text style={styles.avatarChipIcon}>{avatar.emoji}</Text>
                  <Text style={[styles.avatarChipText, active && styles.avatarChipTextActive]}>
                    {avatar.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Animated presence</Text>
              <Text style={styles.switchDesc}>
                Pulse the avatar while Hermes is linked, working, or waiting for approval
              </Text>
            </View>
            <Switch
              value={playfulMotion}
              onValueChange={setPlayfulMotion}
              testID="playful-motion-switch"
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={playfulMotion ? '#ffffff' : '#9CA3AF'}
            />
          </View>
        </GlassCard>

        <Text style={styles.sectionTitle}>💬 Hermes Chat (replaces Telegram)</Text>
        <GlassCard>
          <Text style={styles.label}>Your computers</Text>
          <Text style={styles.description}>
            Each computer you connect gets a saved profile. Use Cloud Relay for off-network approvals;
            use a tunnel or local connection for live Chat until full chat relay is enabled.
          </Text>
          <GatewayProfilePicker
            profiles={savedMacProfiles}
            activeProfileId={activeGatewayProfile?.id ?? null}
            onSelect={handleSelectProfile}
            onRemove={handleRemoveProfile}
            scanning={profileScanning || isScanningMacs}
            scanProgress={profileScanProgress}
            scanResult={profileScanResult}
          />
          <LoadingButton
            label="Find computers on Wi‑Fi"
            loadingLabel="Searching Wi‑Fi…"
            loading={isScanningMacs || profileScanning}
            onPress={handleFindMacs}
            testID="find-macs-on-wifi"
            style={styles.pairButton}
          />
          <Text style={styles.description}>
            Hermes on your computer must be running. Local search is a fallback for nearby Macs.
          </Text>
          <MacPairingHelp variant="getting-started" compact testID="settings-mac-pairing-help" />
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleAutoConnect}
            disabled={isAutoConnecting}
            testID="auto-connect-gateway"
          >
            <Text style={styles.primaryButtonText}>
              {isAutoConnecting ? 'Connecting…' : 'Auto-connect to computer gateway'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pairButton}
            onPress={() => setQrScannerVisible(true)}
            testID="scan-pairing-qr"
          >
            <Text style={styles.pairButtonText}>Scan QR from my computer screen</Text>
          </TouchableOpacity>
          {effectiveGatewayUrl ? (
            <Text style={styles.metaLine}>
              Active: {formatGatewayHostLabel(effectiveGatewayUrl, health)}
              {health?.level === 'green' ? ' · healthy' : ''}
            </Text>
          ) : null}
          <View style={styles.spacer} />
          <Text style={styles.label}>Advanced — Gateway URL / Tunnel</Text>
          <Text style={styles.description}>
            Only if auto-connect fails. Paste ngrok URL or LAN IP (port 8642).
          </Text>
          <TextInput
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
          <Text style={styles.label}>Gateway API Key</Text>
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
            Stored in the device keychain. Required for Chat tab session APIs.
          </Text>
        </GlassCard>

        <Text style={styles.sectionTitle}>💻 Mac gateway on your computer</Text>
        <Text style={styles.description}>
          Toolsets, cron jobs, and skills — live from Hermes on your Mac. Scroll here to manage automation
          after you connect above.
        </Text>
        <GatewayOpsSection />

        <Text style={styles.sectionTitle}>🪢 Approval relay (ThumbGate Leash)</Text>
        <GlassCard>
          <Text style={styles.description}>
            Pair with your computer for tool approvals on LTE/5G. This is the same shape as Telegram:
            your phone talks to a cloud relay while Hermes keeps running locally on your computer.
            Live Chat still needs a gateway tunnel until the cloud chat relay is enabled.
          </Text>
          <View style={styles.spacer} />
          <Text style={styles.label}>Cloud relay URL</Text>
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
        </GlassCard>

        <Text style={styles.sectionTitle}>👍👎 ThumbGate memory (ThumbGate Leash)</Text>
        <GlassCard>
          <Text style={styles.description}>
            ThumbGate Leash uses thumbs up/down. Thumbs down can save a lesson so the same risky
            pattern is blocked on future agent runs. Thumbs up can optionally record approvals.
          </Text>
          <View style={styles.spacer} />
          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Thumbs down → remember block</Text>
              <Text style={styles.switchDesc}>Capture to ThumbGate when you reject a tool</Text>
            </View>
            <Switch
              value={thumbgateCaptureOnDown}
                onValueChange={(val) => {
                  setThumbgateCaptureOnDown(val);
                }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={thumbgateCaptureOnDown ? '#ffffff' : '#9CA3AF'}
            />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Thumbs up → record approval</Text>
              <Text style={styles.switchDesc}>Optional positive signal when you allow a tool</Text>
            </View>
            <Switch
              value={thumbgateCaptureOnUp}
              onValueChange={(val) => {
                setThumbgateCaptureOnUp(val);
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={thumbgateCaptureOnUp ? '#ffffff' : '#9CA3AF'}
            />
          </View>
          <View style={styles.spacer} />
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
            Required for cloud ThumbGate. Local `npx thumbgate start-api` may work without a key on
            LAN.
          </Text>
        </GlassCard>

        <Text style={styles.sectionTitle}>🔌 ThumbGate Leash connection mode</Text>
        <GlassCard>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              injectSmokeApproval();
            }}
            testID="leash-smoke-test"
          >
            <Text style={styles.secondaryButtonText}>Preview ThumbGate Leash card (smoke test)</Text>
          </TouchableOpacity>
          <Text style={styles.description}>
            Injects a fake blocked-command card on ThumbGate Leash. Does not touch your computer gateway.
          </Text>
          <View style={styles.spacer} />
          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Use approval relay (LTE)</Text>
              <Text style={styles.switchDesc}>Poll cloud queue (works on LTE)</Text>
            </View>
            <Switch
              value={connectionMode === 'relay'}
              onValueChange={(val) => {
                setConnectionMode(val ? 'relay' : 'gateway');
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={connectionMode === 'relay' ? '#ffffff' : '#9CA3AF'}
            />
          </View>
        </GlassCard>

        {connectionMode === 'gateway' ? (
          <Text style={styles.sectionTitle}>🔗 Direct gateway events (ThumbGate Leash)</Text>
        ) : null}
        {connectionMode === 'gateway' ? (
        <GlassCard>
          <Text style={styles.description}>
            ThumbGate Leash listens on WebSocket /v1/events at the gateway URL above (tunnel required on LTE).
          </Text>
        </GlassCard>
        ) : null}

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
              <Text style={styles.switchLabel}>Smart notifications</Text>
              <Text style={styles.switchDesc}>
                Time-sensitive approvals (Approve/Deny actions), live computer activity while
                backgrounded, and finish summaries with badge counts
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={async (val) => {
                if (val && Platform.OS !== 'web') {
                  const granted = await requestHermesNotificationPermission();
                  if (!granted) {
                    Alert.alert(
                      'Notifications blocked',
                      'Enable notifications in system settings to get approval alerts and live activity while Hermes is in the background.',
                    );
                    return;
                  }
                }
                setNotificationsEnabled(val);
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={notificationsEnabled ? '#ffffff' : '#9CA3AF'}
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

        <Text style={styles.sectionTitle}>🪢 Safety mode (ThumbGate Leash)</Text>
        <GlassCard>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Prioritize ThumbGate Leash</Text>
              <Text style={styles.switchDesc}>
                Open ThumbGate Leash on launch (Chat stays first in the tab bar)
              </Text>
            </View>
            <Switch
              value={safetyMode}
              onValueChange={(val) => {
                if (val && !requireLeashPro('Safety mode')) {
                  return;
                }
                setSafetyMode(val);
              }}
              testID="safety-mode-switch"
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={safetyMode ? '#ffffff' : '#9CA3AF'}
            />
          </View>
          <Text style={styles.description}>
            Off by default — Chat is the Telegram replacement. Turn on when you want mobile kill-switch
            alerts and computer approvals.mode is manual or smart.
          </Text>
        </GlassCard>

        <Text style={styles.sectionTitle}>👓 Glance mode</Text>
        <GlassCard>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Glanceable approvals (AI glasses parity)</Text>
              <Text style={styles.switchDesc}>
                Stack UI, larger approve/reject targets, spoken status on connect
              </Text>
            </View>
            <Switch
              value={glanceMode}
              onValueChange={(val) => {
                if (val && !requireLeashPro('Glance mode')) {
                  return;
                }
                setGlanceMode(val);
              }}
              testID="glance-mode-switch"
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={glanceMode ? '#ffffff' : '#9CA3AF'}
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

        {__DEV__ ? (
          <>
            <Text style={styles.sectionTitle}>🧪 Developer Tools</Text>
            <GlassCard>
              <View style={styles.switchRow}>
                <View style={styles.switchLabelCol}>
                  <Text style={styles.switchLabel}>Demo & Sandbox Mode</Text>
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
          Hermes Mobile v0.1.0 • {connectionMode === 'relay' ? 'Relay' : 'WS'}: {connectionState}
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
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  gatewayOpsShortcut: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.28)',
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  gatewayOpsShortcutText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.accent,
  },
  gatewayOpsShortcutHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
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
  choiceGrid: {
    gap: 8,
    marginTop: 10,
  },
  personaChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  personaChipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
  },
  personaChipText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textSecondary,
  },
  personaChipTextActive: {
    color: colors.text,
  },
  personaChipDesc: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  avatarChip: {
    minWidth: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  avatarChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79, 70, 229, 0.16)',
  },
  avatarChipIcon: {
    fontSize: 18,
    color: colors.text,
    marginBottom: 3,
  },
  avatarChipText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textMuted,
  },
  avatarChipTextActive: {
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 12,
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
