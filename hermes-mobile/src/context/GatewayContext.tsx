import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createContext, useContext } from 'use-context-selector';
import { AppState, Linking, Platform } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { isTailscaleVpnActive } from '../utils/tailscaleVpnDetect';
import {
  cacheDirectory as fileSystemCacheDirectory,
  getInfoAsync as fileSystemGetInfoAsync,
  writeAsStringAsync as fileSystemWriteAsStringAsync,
} from 'expo-file-system/legacy';
import type {
  GatewayEventMessage,
  GatewayHealthSnapshot,
  GatewaySettings,
  PendingApproval,
  ReclaimFiredPayload,
} from '../types/gateway';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import type { RunProgressState } from '../types/chatDisplay';
import { applyStreamEvent, attachRunMetadata } from '../utils/chatStreamEvents';
import type { ChatStreamEvent } from '../types/gatewayApi';
import type { GatewayProfile, GatewayProfileState, DiscoveredGateway } from '../types/gatewayProfile';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import { EMPTY_GATEWAY_PROFILE_STATE } from '../types/gatewayProfile';
import { storage } from '../services/storage';
import { secureCredentials } from '../services/secureCredentials';
import {
  MobileRelayApiError,
  completePairing,
  enqueuedEventToPendingApproval,
  fetchMobileRelayHealth,
  fetchQueue,
  normalizeRelayWorkers,
  requestTestIntercept,
  resolveActiveRelayWorkerId,
  submitVerdict,
} from '../services/mobileRelayClient';
import {
  buildDemoGateBlockedEvent,
  buildEventsWebSocketUrl,
  buildGateActionMessage,
  fetchGatewayHealth,
  gateBlockedToPending,
  parseGatewayEvent,
  parseReclaimEvent,
} from '../services/gatewayClient';
import { haptics } from '../services/haptics';
import { getPackagerHostIp } from '../services/discover';
import { emitSignOfLife } from '../services/signOfLife';
import {
  runHermesAgentTool,
  type HermesAgentToolName,
  type HermesAgentToolResult,
} from '../services/hermesAgentTools';
import { captureThumbgateFeedback } from '../services/thumbgateClient';
import { stopRun } from '../services/hermesGatewayClient';
import {
  setPostHogDogfoodExclusions,
  setProductAnalyticsOptOut,
  trackProductEvent,
} from '../services/productAnalytics';
import {
  buildChatOutputThumbgateCaptureBody,
  buildLeashThumbgateCaptureBody,
  type ThumbgateCaptureSignal,
} from '../utils/leashThumbgate';
import type { HermesMessage, HermesSession } from '../types/chat';
import {
  buildSessionGreeting,
  resolvePresentationState,
  type PresentationState,
} from '../utils/presentationMode';
import {
  isDemoModeAllowed,
  isDeveloperLeashUnlockAllowed,
  sanitizeDemoModeForRelease,
} from '../utils/demoModePolicy';
import {
  buildGatewayUrlFromLanIp,
  extractLanIpFromGatewayUrl,
  isLoopbackGatewayUrl,
  isValidGatewayUrl,
  resolveDisplayLanIp,
} from '../utils/gatewayUrlPolicy';
import {
  cellularTailscaleFallbackUrls,
  shouldSkipLanGatewayProbe,
  usbLoopbackFallbackUrls,
  USB_LOOPBACK_GATEWAY_URL,
  wifiLanFallbackUrls,
} from '../utils/gatewayLoopbackFallback';
import {
  CONNECTION_SELF_HEAL_INTERVAL_MS,
  buildSelfHealProbeUrls,
  savedProfileFallbackUrls,
  resolveApiKeyForGatewayProbe,
  resolveCellularTailscaleFailoverUrl,
  shouldClearUsbPrimaryOnCellular,
  shouldDeferLoopbackSuccessOnCellular,
  shouldPreferUsbProbeFirst,
} from '../utils/connectionSelfHeal';
import {
  shouldRunBackgroundTailscaleProbe,
  type ProbeTailscaleComputersOptions,
} from '../utils/tailscaleProbeCadence';
import { CONNECTION_HEAL_EXHAUSTED_AFTER } from '../utils/connectionErrorPolicy';
import { planWrongKeyRecovery } from '../utils/wrongKeyRecovery';
import {
  freshInstallMarkerUri,
  pairingStateLooksPersisted,
  shouldWipeRestoredPairingState,
} from '../utils/freshInstallGuard';
import { clearPendingContinuityHandoff } from '../services/sessionContinuityStorage';
import {
  evaluatePairDeepLinkApply,
  shouldRunForegroundUsbHeal,
} from '../utils/pairDeepLinkApply';
import {
  partitionSilentDiscoveries,
  shouldAutoScanOnBootstrap,
} from '../utils/discoveryPersistPolicy';
import {
  hasNonLoopbackSavedProfile,
  profileMatchesDiscoveredGateway,
  profileMatchesHostname,
} from '../utils/gatewayProfilePicker';
import { isPrivateLanGatewayUrl } from '../utils/gatewayEndpoint';
import { isTailscaleGatewayUrl } from '../utils/tailscaleHosts';
import { expandTailnetProbeHosts } from '../utils/tailnetProbeExpand';
import type { SetupDeepLinkParams } from '../utils/setupDeepLink';
import { syncExtraProfileApiKeys } from '../utils/gatewayProfileCredentialSync';
import {
  type GatewayBootstrapPhase,
  isGatewayHealthOk,
  isMacGatewayHttpOk,
  isGatewayReachable as checkGatewayReachable,
} from '../utils/gatewayConnection';
import {
  activeProfile,
  gatewayProfiles,
  migrateLegacyGateway,
  removeProfile,
  selectProfile,
  touchProfileHealth,
  upsertDiscoveredProfile,
  applyHealDiscoveredUrl,
  applyTailscaleDiscoveriesToProfileState,
  dedupeGatewayProfiles,
  findProfileForGatewayUrl,
  GENERIC_USB_PROFILE_LABEL,
  healPersistAcceptedProbedUrl,
  isDiscoveredUrlAllowedForActiveProfile,
  profileDisplayName,
  profileIdFromGatewayUrl,
  resolvePreferredActiveProfileId,
  resolveHealPersistDecision,
  sanitizeGatewayProfileState,
  shouldProbeGatewayUrlForActiveProfile,
  shouldAcceptHealthIdentityForProfile,
  profilesForActiveMachine,
  isGenericMachineLabel,
} from '../services/gatewayProfiles';
import {
  bootstrapTailnetProbeHostsFromPairServers,
  discoverAllGatewaysOnLan,
  discoverGatewayOnPhoneSubnet,
  discoverGatewayViaPairServer,
  pairServerHostFromGatewayUrl,
  probeLiveUsbGateway,
  resolvePairServerMachineName,
  resolvePairServerRelayCode,
  resolvePairServerSetupParams,
  summarizeDiscoveredReach,
} from '../services/gatewayDiscovery';
import {
  isUsbHandoffSourceUrl,
  resolveSameMachineRemoteUrl,
  resolveUsbToRemoteHandoff,
  resolveUsbTransportHandoff,
} from '../utils/usbTransportHandoff';
import { resolveProfileAfterEnsureUpsert } from '../utils/resolveEnsureProfile';
import {
  collectTailnetProbeHosts,
  discoverTailscaleGatewayForProfile,
  discoverTailscaleGateways,
  filterNewTailscaleDiscoveries,
  mergeTailnetProbeHostsFromScan,
  tailnetHostsFromDiscoveries,
} from '../services/tailscaleDiscovery';
import { tailnetProbeStorage } from '../services/tailnetProbeStorage';
import { isGatewaySmokeTestMessage } from '../utils/gatewaySmokeMessages';
import { isThumbgateLeashUnlocked } from '../utils/thumbgateLeash';
import { withDeveloperLeashUnlocked } from '../utils/developerLeashUnlock';
import {
  initializeThumbgateIapListeners,
  syncThumbgateLeashEntitlement,
} from '../services/thumbgateIap';
import type { ApprovalChoice } from '../types/approval';
import type { RelayWorker } from '../types/mobileRelay';
import { resolveApprovalChoice } from '../services/approvalResolver';
import { requestStoreReviewIfThresholdReached } from '../services/storeReview';
import { fromPendingApproval } from '../utils/approvalNormalize';
import { shouldScheduleApprovalNotification } from '../utils/smartNotificationPolicy';
import { withDerivedNotificationsEnabled } from '../utils/notificationPreferences';
import {
  cappedBadgeCount,
  dedupeAndCapPendingApprovals,
  pendingApprovalsSignature,
} from '../utils/pendingApprovalsCap';
import {
  dismissApprovalNotifications,
  dismissApprovalNotification,
  syncSmartApprovalNotifications,
  dismissApprovalNotification as dismissSingleApprovalNotification,
  initApprovalNotifications,
  parseHermesNotificationResponse,
  requestApprovalNotificationPermission,
  scheduleApprovalNotification,
  scheduleRunCompletedNotification,
  scheduleRunProgressNotification,
  scheduleRunStallNotification,
  cancelRunStallNotification,
  clearRunProgressNotification,
  syncHermesNotificationBadge,
  addApprovalNotificationResponseListener,
} from '../services/approvalNotifications';

const MOBILE_RELAY_POLL_MS = 2000;
// After the initial quiet six-probe window, retain an inexpensive reachability
// probe for a saved, active computer. This lets a foregrounded phone notice
// that its computer came back without making the connection UI noisy.
const SAVED_PROFILE_RECONNECT_INTERVAL_MS = 30_000;

export type GatewayContextValue = {
  settings: GatewaySettings;
  apiKey: string;
  thumbgateApiKey: string;
  mobileToken: string;
  isPaired: boolean;
  isLoaded: boolean;
  bootstrapReady: boolean;
  gatewayBootstrapPhase: GatewayBootstrapPhase;
  isGatewayReachable: boolean;
  health: GatewayHealthSnapshot | null;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  pendingApprovals: PendingApproval[];
  recentReclaims: ReclaimFiredPayload[];
  lastEventError?: string;
  presentation: PresentationState;
  sessionGreeting?: string;
  effectiveGatewayUrl: string;
  transcriptSyncNonce: number;
  relayWorkers: RelayWorker[];
  activeRelayWorkerId: string | null;
  gatewayProfiles: GatewayProfile[];
  activeGatewayProfile: GatewayProfile | null;
  profileScanning: boolean;
  wifiConnected: boolean;
  profileScanProgress: LanScanProgress | null;
  profileScanResult: LanScanResult | null;
  refreshHealth: () => Promise<void>;
  autoConnectGateway: () => Promise<string>;
  retryGatewayBootstrap: () => Promise<boolean>;
  applySetupDeepLink: (params: SetupDeepLinkParams) => Promise<void>;
  selectGatewayProfile: (
    profileId: string,
    options?: { ensureProfile?: GatewayProfile },
  ) => Promise<boolean>;
  removeGatewayProfile: (profileId: string) => Promise<void>;
  scanForGatewayProfiles: () => Promise<GatewayProfile[]>;
  tailscaleDiscoveries: DiscoveredGateway[];
  tailscaleDiscoveryProbing: boolean;
  tailscaleVpnActive: boolean;
  tailnetProbeHostCount: number;
  probeTailscaleComputers: (options?: ProbeTailscaleComputersOptions) => Promise<void>;
  addDiscoveredTailscaleComputer: (discovery: DiscoveredGateway) => Promise<void>;
  connectionHealAttempt: number;
  connectionHealInFlight: boolean;
  connectionHealExhausted: boolean;
  saveSettings: (
    settings: GatewaySettings,
    apiKey: string,
    thumbgateApiKey?: string,
  ) => Promise<void>;
  patchSettings: (patch: Partial<GatewaySettings>) => Promise<void>;
  /** Developer backdoor — persist Leash unlock without IAP. */
  activateDeveloperLeashUnlock: () => Promise<void>;
  addGatewayProfile: (label: string, gatewayUrl: string) => Promise<void>;
  connectEvents: () => void;
  disconnectEvents: () => void;
  completePair: (code: string) => Promise<void>;
  disconnectPair: () => Promise<void>;
  requestTestIntercept: () => Promise<void>;
  injectDemoApproval: () => void;
  injectSmokeApproval: () => void;
  activateStoreLeashPreview: () => void;
  storeLeashPreviewActive: boolean;
  enqueueTextApproval: (approval: PendingApproval) => boolean;
  resolveApproval: (
    actionId: string,
    decision: 'approve' | 'reject',
    approval?: PendingApproval,
  ) => void;
  submitApprovalChoice: (
    actionId: string,
    choice: ApprovalChoice,
    approval?: PendingApproval,
  ) => Promise<void>;
  sendGateAction: (rawMessage: string) => void;
  runAgentTool: (name: HermesAgentToolName) => Promise<HermesAgentToolResult>;
  pendingApprovalEditSeed: string | null;
  setApprovalEditSeed: (text: string) => void;
  clearApprovalEditSeed: () => void;
  pendingChatRelayText: string | null;
  clearChatRelayText: () => void;
  runProgress: RunProgressState | null;
  setRunProgress: React.Dispatch<React.SetStateAction<RunProgressState | null>>;
  /** While true, WebSocket must not mutate runProgress — HTTP chat stream owns the banner. */
  setChatStreamProgressActive: (active: boolean) => void;
  notificationFocusSessionId: string | null;
  focusChatSession: (sessionId: string) => void;
  clearNotificationFocusSession: () => void;
  addGatewayListener: (listener: (event: GatewayEventMessage) => void) => void;
  removeGatewayListener: (listener: (event: GatewayEventMessage) => void) => void;
  /** Message id (or fallback key) while chat-output ThumbGate capture is in flight. */
  chatOutputFeedbackBusyId: string | null;
  submitChatOutputFeedback: (
    message: HermesMessage,
    signal: ThumbgateCaptureSignal,
    options?: { session?: HermesSession | null; explanation?: string },
  ) => Promise<boolean>;
};

export const GatewayContext = createContext<GatewayContextValue | null>(null);

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<GatewaySettings>(DEFAULT_GATEWAY_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [mobileToken, setMobileToken] = useState('');
  const [thumbgateApiKey, setThumbgateApiKey] = useState('');
  const [runProgress, setRunProgress] = useState<RunProgressState | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [health, setHealth] = useState<GatewayHealthSnapshot | null>(null);
  const [connectionState, setConnectionState] =
    useState<GatewayContextValue['connectionState']>('disconnected');
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [recentReclaims, setRecentReclaims] = useState<ReclaimFiredPayload[]>([]);
  const [lastEventError, setLastEventError] = useState<string | undefined>();
  const [transcriptSyncNonce, setTranscriptSyncNonce] = useState(0);
  const [relayWorkers, setRelayWorkers] = useState<RelayWorker[]>([]);
  const [activeRelayWorkerId, setActiveRelayWorkerId] = useState<string | null>(null);
  const [sessionGreeting, setSessionGreeting] = useState<string | undefined>();
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [gatewayBootstrapPhase, setGatewayBootstrapPhase] =
    useState<GatewayBootstrapPhase>('booting');
  const [profileState, setProfileState] = useState<GatewayProfileState>(EMPTY_GATEWAY_PROFILE_STATE);
  const [profileScanning, setProfileScanning] = useState(false);
  const [profileScanProgress, setProfileScanProgress] = useState<LanScanProgress | null>(null);
  const [profileScanResult, setProfileScanResult] = useState<LanScanResult | null>(null);
  const [tailscaleDiscoveries, setTailscaleDiscoveries] = useState<DiscoveredGateway[]>([]);
  const [tailscaleDiscoveryProbing, setTailscaleDiscoveryProbing] = useState(false);
  const [tailscaleVpnActive, setTailscaleVpnActive] = useState(false);
  /** Set after a completed hit to a Tailscale host — Samsung NetInfo often stays cellular. */
  const reachedTailscaleHostRef = useRef(false);
  const [tailnetProbeHostCount, setTailnetProbeHostCount] = useState(0);
  const [effectiveGatewayUrl, setEffectiveGatewayUrl] = useState(
    DEFAULT_GATEWAY_SETTINGS.gatewayUrl,
  );
  const [pendingApprovalEditSeed, setPendingApprovalEditSeed] = useState<string | null>(null);
  const [pendingChatRelayText, setPendingChatRelayText] = useState<string | null>(null);
  const [notificationFocusSessionId, setNotificationFocusSessionId] = useState<string | null>(
    null,
  );
  const [chatOutputFeedbackBusyId, setChatOutputFeedbackBusyId] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectEventsRef = useRef<() => void>(() => {});
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mobileTokenRef = useRef('');
  const thumbgateApiKeyRef = useRef('');
  const settingsRef = useRef(settings);
  const apiKeyRef = useRef(apiKey);
  const effectiveGatewayUrlRef = useRef(DEFAULT_GATEWAY_SETTINGS.gatewayUrl);
  const profileStateRef = useRef<GatewayProfileState>(EMPTY_GATEWAY_PROFILE_STATE);
  const healthRef = useRef(health);
  const signOfLifeSentRef = useRef(false);
  const initialBootstrapRef = useRef(false);
  const resolveApprovalRef = useRef<
    (actionId: string, decision: 'approve' | 'reject', approval?: PendingApproval) => void
  >(null as any);
  const submitApprovalChoiceRef = useRef<
    (actionId: string, choice: ApprovalChoice, approval?: PendingApproval) => Promise<void>
  >(null as any);
  const pendingApprovalsRef = useRef<PendingApproval[]>([]);
  const pendingNotifSignatureRef = useRef<string>('');
  const resolvedTextApprovalIdsRef = useRef<Set<string>>(new Set());
  const runProgressRef = useRef<RunProgressState | null>(null);
  const chatStreamProgressActiveRef = useRef(false);
  const setChatStreamProgressActive = useCallback((active: boolean) => {
    chatStreamProgressActiveRef.current = active;
  }, []);
  const listenersRef = useRef<Set<(event: GatewayEventMessage) => void>>(new Set());
  const wifiConnectedRef = useRef(true);
  const [wifiConnected, setWifiConnected] = useState(true);
  const selectGatewayProfileRef = useRef<
    (profileId: string, options?: { ensureProfile?: GatewayProfile }) => Promise<boolean>
  >(async () => false);
  const tailnetProbeHostsRef = useRef<string[]>([]);
  const tailscaleProbeInFlightRef = useRef(false);
  const lastTailscaleProbeAtMsRef = useRef(0);
  const lastNetInfoStateRef = useRef<NetInfoState | null>(null);
  const probeTailscaleComputersRef = useRef<
    (options?: ProbeTailscaleComputersOptions) => Promise<void>
  >(async () => {});
  const runConnectionSelfHealRef = useRef<() => Promise<void>>(async () => {});
  const maybeHandoffTailscaleToUsbRef = useRef<() => Promise<boolean>>(async () => false);
  const maybeHandoffUsbToRemoteRef = useRef<() => Promise<boolean>>(async () => false);
  const connectionHealInFlightRef = useRef(false);
  const usbHandoffInFlightRef = useRef(false);
  const connectionHealAttemptRef = useRef(0);
  const [connectionHealAttempt, setConnectionHealAttempt] = useState(0);
  const [connectionHealInFlight, setConnectionHealInFlight] = useState(false);
  const updateTailscaleVpnActive = useCallback((netInfoState?: NetInfoState) => {
    if (netInfoState) {
      lastNetInfoStateRef.current = netInfoState;
    }
    const currentNetInfoState = lastNetInfoStateRef.current;
    const ipAddress = (
      currentNetInfoState?.details as { ipAddress?: string } | null | undefined
    )?.ipAddress;
    setTailscaleVpnActive(
      isTailscaleVpnActive({
        netInfoType: currentNetInfoState?.type,
        isConnected: currentNetInfoState?.isConnected,
        ipAddress,
        reachedTailscaleHost: reachedTailscaleHostRef.current,
      }),
    );
  }, []);

  const addGatewayListener = useCallback((listener: (event: GatewayEventMessage) => void) => {
    listenersRef.current.add(listener);
  }, []);

  const removeGatewayListener = useCallback((listener: (event: GatewayEventMessage) => void) => {
    listenersRef.current.delete(listener);
  }, []);

  useEffect(() => {
    healthRef.current = health;
  }, [health]);

  useEffect(() => {
    pendingApprovalsRef.current = pendingApprovals;
  }, [pendingApprovals]);

  useEffect(() => {
    runProgressRef.current = runProgress;
  }, [runProgress]);

  useEffect(() => {
    if (!settings.notificationApprovals || Platform.OS === 'web') {
      pendingNotifSignatureRef.current = '';
      syncHermesNotificationBadge(0).catch(() => {});
      return;
    }
    const signature = pendingApprovalsSignature(pendingApprovals);
    const badge = cappedBadgeCount(pendingApprovals.length);
    // Always keep OS badge in sync; skip alert sync when the pending set is unchanged
    // (relay poll replaces the array every 2s even when contents match).
    syncHermesNotificationBadge(badge).catch(() => {});
    if (signature === pendingNotifSignatureRef.current) {
      return;
    }
    pendingNotifSignatureRef.current = signature;
    syncSmartApprovalNotifications(pendingApprovals, {
      badgeCount: badge,
      categoryEnabled: settings.notificationApprovals,
    }).catch(() => {});
  }, [pendingApprovals, settings.notificationApprovals]);

  useEffect(() => {
    if (!settings.notificationsEnabled || Platform.OS === 'web') {
      return;
    }

    let subscription: { remove: () => void } | null = null;

    const setup = async () => {
      await initApprovalNotifications();
      await requestApprovalNotificationPermission();
      const listener = await addApprovalNotificationResponseListener(async (response) => {
        const parsed = parseHermesNotificationResponse(response);
        if (!parsed) {
          return;
        }
        if (parsed.kind === 'navigate') {
          if (parsed.sessionId) {
            setNotificationFocusSessionId(parsed.sessionId);
          }
          const path =
            parsed.tab === 'Chat'
              ? parsed.sessionId
                ? `hermes://chat?session=${encodeURIComponent(parsed.sessionId)}`
                : 'hermes://chat'
              : 'hermes://leash';
          await Linking.openURL(path);
          return;
        }
        if (parsed.kind === 'stop_run') {
          if (parsed.runId) {
            try {
              await stopRun(
                effectiveGatewayUrlRef.current,
                parsed.runId,
                apiKeyRef.current,
              );
            } catch (error) {
              setLastEventError(
                error instanceof Error ? error.message : 'Failed to stop run from notification',
              );
            }
          }
          setRunProgress(null);
          await clearRunProgressNotification();
          await cancelRunStallNotification();
          await dismissApprovalNotifications();
          return;
        }
        if (parsed.kind !== 'approval' || !submitApprovalChoiceRef.current) {
          return;
        }
        const match =
          pendingApprovalsRef.current.find((p) => p.actionId === parsed.actionId) ??
          pendingApprovalsRef.current.find((p) => p.runId === parsed.actionId);
        try {
          await submitApprovalChoiceRef.current(parsed.actionId, parsed.choice, match);
          await dismissSingleApprovalNotification(parsed.actionId);
        } catch (error) {
          setLastEventError(
            error instanceof Error ? error.message : 'Notification approval failed',
          );
        }
      });
      if (listener) {
        subscription = listener;
      }
    };

    setup();
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [settings.notificationsEnabled]);

  useEffect(() => {
    if (!mobileToken && mobileTokenRef.current) {
      return;
    }
    mobileTokenRef.current = mobileToken;
  }, [mobileToken]);

  useEffect(() => {
    settingsRef.current = settings;
    apiKeyRef.current = apiKey;
    effectiveGatewayUrlRef.current = effectiveGatewayUrl;
    setProductAnalyticsOptOut(Boolean(settings.analyticsOptOut));
    setPostHogDogfoodExclusions({
      developerLeashUnlock: Boolean(settings.developerLeashUnlock),
    });
  }, [settings, apiKey, effectiveGatewayUrl]);

  useEffect(() => {
    let mounted = true;
    const bootstrapTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[hermes-mobile] Bootstrap timed out after 8s — showing UI with defaults');
        setIsLoaded(true);
      }
    }, 8000);

    (async () => {
      try {
        let savedSettings = await storage.loadGatewaySettings();
        const lastLanIp = await storage.loadLastGatewayLanIp();
        let loadedProfiles = await gatewayProfiles.load();
        // Android Auto Backup / cloud restore can revive AsyncStorage + SecureStore
        // after a Play reinstall while cache (our marker) stays empty. Wipe pairing
        // so a stranger cold-start never inherits stale wrong-key Macs.
        try {
          const markerUri = freshInstallMarkerUri(fileSystemCacheDirectory);
          if (markerUri) {
            const markerInfo = await fileSystemGetInfoAsync(markerUri);
            const savedKeyPreview = await secureCredentials.loadApiKey();
            const savedTokenPreview = await secureCredentials.loadMobileToken();
            const shouldWipe = shouldWipeRestoredPairingState({
              markerExists: markerInfo.exists,
              hasPersistedPairingState: pairingStateLooksPersisted({
                profileCount: loadedProfiles.profiles.length,
                hasApiKey: Boolean(savedKeyPreview?.trim()),
                hasMobileToken: Boolean(savedTokenPreview?.trim()),
                hasGatewayUrl: Boolean(savedSettings.gatewayUrl?.trim()),
              }),
            });
            if (shouldWipe) {
              console.warn(
                '[hermes-mobile] Wiping restored pairing state (cache marker missing)',
              );
              await storage.clearAll();
              await secureCredentials.clearAllCredentials();
              await clearPendingContinuityHandoff();
              loadedProfiles = { ...EMPTY_GATEWAY_PROFILE_STATE };
              savedSettings = { ...DEFAULT_GATEWAY_SETTINGS };
            }
            if (!markerInfo.exists) {
              await fileSystemWriteAsStringAsync(markerUri, String(Date.now()));
            }
          }
        } catch (wipeErr) {
          console.warn('[hermes-mobile] fresh-install guard failed:', wipeErr);
        }
        loadedProfiles = migrateLegacyGateway(loadedProfiles, savedSettings.gatewayUrl, lastLanIp);
        if (Platform.OS !== 'web') {
          // Fresh install (no real Mac yet): never invent a USB 127.0.0.1 profile —
          // that forces "Computer via USB · Reconnecting…" before the user ever connected.
          // Only seed loopback as an alternate route when a Tailscale/LAN Mac is already saved.
          const hasLoopback = loadedProfiles.profiles.some((p) =>
            isLoopbackGatewayUrl(p.gatewayUrl),
          );
          if (!hasLoopback && hasNonLoopbackSavedProfile(loadedProfiles.profiles)) {
            const named = loadedProfiles.profiles
              .map((profile) => ({ profile, name: profileDisplayName(profile) }))
              .find(({ name }) => !isGenericMachineLabel(name));
            const displayName = named?.name;
            loadedProfiles.profiles.push({
              id: displayName
                ? profileIdFromGatewayUrl(USB_LOOPBACK_GATEWAY_URL, displayName)
                : 'mac_usb_loopback',
              label: displayName ?? GENERIC_USB_PROFILE_LABEL,
              gatewayUrl: USB_LOOPBACK_GATEWAY_URL,
              hostname: displayName ? `${displayName.replace(/\.local$/i, '')}.local` : undefined,
              localIp: '127.0.0.1',
              addedAt: new Date().toISOString(),
            });
          }
          loadedProfiles = sanitizeGatewayProfileState(loadedProfiles);
        }
        if (loadedProfiles.profiles.length > 0) {
          const hasValidActive =
            loadedProfiles.activeProfileId &&
            loadedProfiles.profiles.some((p) => p.id === loadedProfiles.activeProfileId);
          if (!hasValidActive) {
            const lastSelectedId = await storage.loadLastSelectedProfileId();
            const lastSelectedValid =
              lastSelectedId &&
              loadedProfiles.profiles.some((profile) => profile.id === lastSelectedId);
            const preferredActiveId = lastSelectedValid
              ? lastSelectedId
              : resolvePreferredActiveProfileId(loadedProfiles);
            if (preferredActiveId) {
              loadedProfiles = { ...loadedProfiles, activeProfileId: preferredActiveId };
            }
          }
          await gatewayProfiles.save(loadedProfiles);
        }

        const savedKey = await secureCredentials.loadApiKey();
        const savedThumbgateKey = await secureCredentials.loadThumbgateApiKey();
        const savedMobileToken = await secureCredentials.loadMobileToken();

        const active = activeProfile(loadedProfiles);
        let resolvedKey = savedKey || '';
        let resolvedSettings = sanitizeDemoModeForRelease(savedSettings);
        if (!isDemoModeAllowed() && savedSettings.demoMode) {
          await storage.saveGatewaySettings(resolvedSettings);
        }
        if (active) {
          resolvedSettings = { ...savedSettings, gatewayUrl: active.gatewayUrl };
          const profileKey = await secureCredentials.resolveApiKeyForProfile(active.id);
          if (profileKey) {
            resolvedKey = profileKey;
          }
        }
        if (!isValidGatewayUrl(resolvedSettings.gatewayUrl)) {
          const fallbackProfile = loadedProfiles.profiles.find((p) =>
            isValidGatewayUrl(p.gatewayUrl),
          );
          const fallbackUrl =
            (active && isValidGatewayUrl(active.gatewayUrl) ? active.gatewayUrl : undefined) ??
            fallbackProfile?.gatewayUrl;
          // Brand-new install: keep gatewayUrl empty so ConnectMacGate shows — never invent USB.
          if (fallbackUrl) {
            resolvedSettings = { ...resolvedSettings, gatewayUrl: fallbackUrl };
          }
        }

        if (!mounted) return;
        profileStateRef.current = loadedProfiles;
        setProfileState(loadedProfiles);
        tailnetProbeHostsRef.current = await tailnetProbeStorage.load();
        setTailnetProbeHostCount(tailnetProbeHostsRef.current.length);
        setSettings(resolvedSettings);
        settingsRef.current = resolvedSettings;
        setProductAnalyticsOptOut(Boolean(resolvedSettings.analyticsOptOut));
        setPostHogDogfoodExclusions({
          developerLeashUnlock: Boolean(resolvedSettings.developerLeashUnlock),
        });
        effectiveGatewayUrlRef.current = resolvedSettings.gatewayUrl;
        setEffectiveGatewayUrl(resolvedSettings.gatewayUrl);
        setApiKey(resolvedKey);
        apiKeyRef.current = resolvedKey;
        thumbgateApiKeyRef.current = savedThumbgateKey ?? '';
        setThumbgateApiKey(savedThumbgateKey ?? '');
        setMobileToken(savedMobileToken ?? '');
        mobileTokenRef.current = savedMobileToken ?? '';
        setIsLoaded(true);
      } catch (error) {
        console.error('[hermes-mobile] Gateway bootstrap failed:', error);
        if (mounted) {
          setLastEventError(
            error instanceof Error ? error.message : 'Failed to load saved settings',
          );
          setIsLoaded(true);
        }
      } finally {
        clearTimeout(bootstrapTimeout);
      }
    })();
    return () => {
      mounted = false;
      clearTimeout(bootstrapTimeout);
    };
  }, []);

  /** Store entitlement sync runs after first paint — never block cold start on billing. */
  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    let cancelled = false;
    void (async () => {
      initializeThumbgateIapListeners();
      const storeEntitled = await syncThumbgateLeashEntitlement();
      if (cancelled || storeEntitled === settingsRef.current.thumbgateProActive) {
        return;
      }
      const nextSettings = { ...settingsRef.current, thumbgateProActive: storeEntitled };
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      await storage.saveGatewaySettings(nextSettings);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded]);

  const persistDiscoveredGatewayUrl = useCallback(
    async (successfulUrl: string, makeProfileActive = false): Promise<string> => {
      if (settingsRef.current.demoMode) {
        return successfulUrl;
      }
      const currentUrl = settingsRef.current.gatewayUrl;
      const requestedActivation =
        makeProfileActive || !profileStateRef.current.activeProfileId;
      const healDecision = resolveHealPersistDecision(
        profileStateRef.current,
        successfulUrl,
        requestedActivation,
      );
      const active = activeProfile(profileStateRef.current);
      const lanIp = extractLanIpFromGatewayUrl(successfulUrl);
      const pairName = lanIp ? await resolvePairServerMachineName(lanIp).catch(() => null) : null;
      const upserted = applyHealDiscoveredUrl(
        profileStateRef.current,
        {
          gatewayUrl: successfulUrl,
          localIp: lanIp ?? active?.localIp ?? undefined,
          hostname: pairName ?? healthRef.current?.hostname ?? active?.hostname,
          label: pairName ?? active?.label ?? undefined,
        },
        healDecision.requestedActivation,
      );
      profileStateRef.current = upserted;
      setProfileState(upserted);
      await gatewayProfiles.save(upserted);

      const activeIdAfterHeal = profileStateRef.current.activeProfileId;
      if (activeIdAfterHeal) {
        const profileKey = await secureCredentials.resolveApiKeyForProfile(activeIdAfterHeal);
        if (profileKey && profileKey !== apiKeyRef.current) {
          setApiKey(profileKey);
          apiKeyRef.current = profileKey;
        }
      }

      if (healDecision.catalogOnly) {
        return healDecision.returnUrl;
      }

      if (successfulUrl !== currentUrl) {
        const nextSettings = { ...settingsRef.current, gatewayUrl: successfulUrl };
        await storage.saveGatewaySettings(nextSettings);
        setSettings(nextSettings);
        settingsRef.current = nextSettings;
      }
      effectiveGatewayUrlRef.current = successfulUrl;
      setEffectiveGatewayUrl(successfulUrl);
      if (lanIp) {
        await storage.saveLastGatewayLanIp(lanIp);
      }
      return successfulUrl;
    },
    [],
  );

  const enrichActiveProfileFromPairServer = useCallback(async (lanIp: string) => {
    const trimmed = lanIp.trim();
    if (!trimmed) {
      return;
    }
    const activeId = profileStateRef.current.activeProfileId;
    if (!activeId) {
      return;
    }
    const pairName = await resolvePairServerMachineName(trimmed).catch(() => null);
    if (!pairName) {
      return;
    }
    const touched = touchProfileHealth(profileStateRef.current, activeId, {
      hostname: pairName,
      localIp: trimmed,
    });
    profileStateRef.current = touched;
    setProfileState(touched);
    await gatewayProfiles.save(touched);
  }, []);

  const refreshHealth = useCallback(async () => {
    const publishHealth = (snapshot: GatewayHealthSnapshot) => {
      const wasUnreachable = !isGatewayHealthOk(healthRef.current);
      setHealth(snapshot);
      healthRef.current = snapshot;
      if (wasUnreachable && isGatewayHealthOk(snapshot)) {
        setConnectionState('connected');
        setRunProgress((previous) =>
          previous?.phase === 'sending' ? null : previous,
        );
      }
    };
    const publishDemoHealth = () => {
      publishHealth({
        level: 'green',
        status: 'ok',
        gatewayState: 'running',
        checkedAt: new Date().toISOString(),
        directGatewayReachable: true,
      });
      setConnectionState('demo');
    };
    const bailIfDemoMode = (): boolean => {
      if (!settingsRef.current.demoMode) {
        return false;
      }
      publishDemoHealth();
      return true;
    };
    if (bailIfDemoMode()) {
      return;
    }
    const currentSettings = settingsRef.current;
    const token = mobileTokenRef.current;
    const gatewayProbeUrl = effectiveGatewayUrlRef.current || currentSettings.gatewayUrl;

    const probeMacGateway = async (url: string) => {
      const probeKey = await resolveApiKeyForGatewayProbe({
        gatewayUrl: url,
        profiles: profileStateRef.current.profiles,
        activeProfileId: profileStateRef.current.activeProfileId,
        fallbackKey: apiKeyRef.current,
        resolveProfileKey: (profileId) => secureCredentials.resolveApiKeyForProfile(profileId),
      });
      if (probeKey !== apiKeyRef.current) {
        setApiKey(probeKey);
        apiKeyRef.current = probeKey;
      }
      const snapshot = await fetchGatewayHealth(url, probeKey);
      if (
        isLoopbackGatewayUrl(url) &&
        isGatewayHealthOk(snapshot) &&
        !snapshot.hostname?.trim()
      ) {
        const pairHost = pairServerHostFromGatewayUrl(url);
        if (pairHost) {
          const pairName = await resolvePairServerMachineName(pairHost).catch(() => null);
          if (pairName) {
            return { ...snapshot, hostname: pairName };
          }
        }
      }
      return snapshot;
    };

    const tryMacGatewayWithLoopbackFallback = async (primaryUrl: string) => {
      const probeMacGatewayOk = async (url: string) => {
        const snapshot = await probeMacGateway(url);
        if (!isGatewayHealthOk(snapshot)) {
          throw new Error(snapshot.errorMessage ?? 'Gateway unreachable');
        }
        return snapshot;
      };

      const skipLan = shouldSkipLanGatewayProbe(primaryUrl, wifiConnectedRef.current);
      const activeProfileId = profileStateRef.current.activeProfileId;
      const cellularTailscaleAlternates = cellularTailscaleFallbackUrls({
        primaryUrl,
        wifiConnected: wifiConnectedRef.current,
        profileUrls: profilesForActiveMachine(
          profileStateRef.current.profiles,
          activeProfileId,
        ).map((profile) => profile.gatewayUrl),
        tailnetProbeHosts: tailnetProbeHostsRef.current,
        activeProfileId,
        profiles: profileStateRef.current.profiles,
      });
      const deferLoopbackOnCellular = shouldDeferLoopbackSuccessOnCellular({
        primaryUrl,
        wifiConnected: wifiConnectedRef.current,
        hasTailscaleAlternate: cellularTailscaleAlternates.length > 0,
        // Heal path: if primary is already USB, prefer keeping it when cable is the intent.
        // Foreign/ghost clears still rely on missing hostname elsewhere.
        liveUsbConfirmed:
          isLoopbackGatewayUrl(primaryUrl) && isMacGatewayHttpOk(healthRef.current),
      });
      const acceptHealUrl = async (fallbackUrl: string, snapshot: Awaited<ReturnType<typeof probeMacGatewayOk>>) => {
        const applied = await persistDiscoveredGatewayUrl(fallbackUrl, true);
        if (!healPersistAcceptedProbedUrl(applied, fallbackUrl)) {
          return null;
        }
        connectionHealAttemptRef.current = 0;
        setConnectionHealAttempt(0);
        return { snapshot, url: fallbackUrl };
      };

      if (skipLan) {
        for (const fallbackUrl of savedProfileFallbackUrls({
          primaryUrl,
          profiles: profileStateRef.current.profiles,
          activeProfileId,
          wifiConnected: wifiConnectedRef.current,
        })) {
          try {
            const snapshot = await probeMacGatewayOk(fallbackUrl);
            const accepted = await acceptHealUrl(fallbackUrl, snapshot);
            if (accepted) {
              return accepted;
            }
          } catch {
            // try next saved profile / tailnet URL
          }
        }
      }
      // On cellular with a Tailscale alternate, never keep ghost USB loopback as the route.
      if (!skipLan && !deferLoopbackOnCellular) {
        try {
          const snapshot = await probeMacGatewayOk(primaryUrl);
          return { snapshot, url: primaryUrl };
        } catch {
          // fall through to Tailscale / USB loopback / Wi‑Fi LAN
        }
      }

      const activeProfileForFallback = activeProfile(profileStateRef.current);
      const primaryIsPrivateLan =
        isPrivateLanGatewayUrl(primaryUrl) && !isLoopbackGatewayUrl(primaryUrl);
      if (
        activeProfileForFallback &&
        primaryIsPrivateLan &&
        !isTailscaleGatewayUrl(primaryUrl) &&
        tailnetProbeHostsRef.current.length > 0
      ) {
        const tailDiscovered = await discoverTailscaleGatewayForProfile(
          activeProfileForFallback,
          tailnetProbeHostsRef.current,
        );
        if (tailDiscovered?.gatewayUrl) {
          try {
            const snapshot = await probeMacGatewayOk(tailDiscovered.gatewayUrl);
            const accepted = await acceptHealUrl(tailDiscovered.gatewayUrl, snapshot);
            if (accepted) {
              return accepted;
            }
          } catch {
            // try generic tailnet fallbacks next
          }
        }
      }

      for (const fallbackUrl of savedProfileFallbackUrls({
        primaryUrl,
        profiles: profileStateRef.current.profiles,
        activeProfileId,
        wifiConnected: wifiConnectedRef.current,
      })) {
        try {
          const snapshot = await probeMacGatewayOk(fallbackUrl);
          const accepted = await acceptHealUrl(fallbackUrl, snapshot);
          if (accepted) {
            return accepted;
          }
        } catch {
          // try next saved profile / tailnet URL
        }
      }

      for (const fallbackUrl of usbLoopbackFallbackUrls(primaryUrl)) {
        if (!shouldProbeGatewayUrlForActiveProfile(profileStateRef.current, fallbackUrl)) {
          continue;
        }
        try {
          const snapshot = await probeMacGatewayOk(fallbackUrl);
          const accepted = await acceptHealUrl(fallbackUrl, snapshot);
          if (accepted) {
            return accepted;
          }
        } catch {
          // try next fallback
        }
      }
      const lastLanIp = await storage.loadLastGatewayLanIp();
      const profileLanIps = profilesForActiveMachine(
        profileStateRef.current.profiles,
        activeProfileId,
      ).map(
        (profile) => profile.localIp?.trim() || extractLanIpFromGatewayUrl(profile.gatewayUrl),
      );
      for (const fallbackUrl of wifiLanFallbackUrls({
        primaryUrl,
        wifiConnected: wifiConnectedRef.current,
        lastLanIp:
          activeProfileId && lastLanIp && !shouldProbeGatewayUrlForActiveProfile(
            profileStateRef.current,
            buildGatewayUrlFromLanIp(lastLanIp),
          )
            ? null
            : lastLanIp,
        profileLanIps,
        activeProfileId,
        profiles: profileStateRef.current.profiles,
      })) {
        try {
          const snapshot = await probeMacGatewayOk(fallbackUrl);
          const accepted = await acceptHealUrl(fallbackUrl, snapshot);
          if (accepted) {
            return accepted;
          }
        } catch {
          // try next LAN candidate
        }
      }
      const profileUrls = profilesForActiveMachine(
        profileStateRef.current.profiles,
        activeProfileId,
      ).map((profile) => profile.gatewayUrl);
      for (const fallbackUrl of cellularTailscaleFallbackUrls({
        primaryUrl,
        wifiConnected: wifiConnectedRef.current,
        profileUrls,
        tailnetProbeHosts: tailnetProbeHostsRef.current,
        activeProfileId,
        profiles: profileStateRef.current.profiles,
      })) {
        try {
          const snapshot = await probeMacGatewayOk(fallbackUrl);
          const accepted = await acceptHealUrl(fallbackUrl, snapshot);
          if (accepted) {
            return accepted;
          }
        } catch {
          // try next tailnet candidate
        }
      }
      if (skipLan) {
        throw new Error('Off Wi‑Fi — direct Mac link unavailable on cellular');
      }
      throw new Error('Hermes gateway unreachable on your Wi‑Fi');
    };

    if (currentSettings.connectionMode === 'relay') {
      try {
        const [relayHealth, macResult] = await Promise.all([
          fetchMobileRelayHealth(currentSettings.cloudUrl),
          tryMacGatewayWithLoopbackFallback(gatewayProbeUrl).catch(() => null),
        ]);
        if (bailIfDemoMode()) {
          return;
        }
        const macHealth = macResult?.snapshot ?? null;
        const macReachable = macHealth ? isGatewayHealthOk(macHealth) : false;
        publishHealth({
          level: relayHealth.ok ? 'green' : 'amber',
          status: relayHealth.ok ? 'ok' : 'degraded',
          gatewayState: token ? 'paired' : 'unpaired',
          checkedAt: new Date().toISOString(),
          hostname: macHealth?.hostname,
          localIp: resolveDisplayLanIp(macHealth?.localIp, macResult?.url ?? gatewayProbeUrl),
          directGatewayReachable: macReachable,
        });
        const lanIp =
          resolveDisplayLanIp(macHealth?.localIp, macResult?.url ?? gatewayProbeUrl) ||
          extractLanIpFromGatewayUrl(macResult?.url ?? gatewayProbeUrl) ||
          undefined;
        if (lanIp) {
          await enrichActiveProfileFromPairServer(lanIp);
        }
      } catch (error) {
        publishHealth({
          level: 'red',
          checkedAt: new Date().toISOString(),
          directGatewayReachable: false,
          errorMessage:
            error instanceof Error ? error.message : 'Hermes Mobile cloud relay unreachable',
        });
      }
      return;
    }

    try {
      const { snapshot, url: resolvedUrl } = await tryMacGatewayWithLoopbackFallback(gatewayProbeUrl);
      if (bailIfDemoMode()) {
        return;
      }
      const sanitizedLocalIp = resolveDisplayLanIp(snapshot.localIp, resolvedUrl);
      if (sanitizedLocalIp) {
        await storage.saveLastGatewayLanIp(sanitizedLocalIp);
      }
      publishHealth({
        ...snapshot,
        localIp: sanitizedLocalIp,
        directGatewayReachable: isGatewayHealthOk(snapshot),
      });

      const activeId = profileStateRef.current.activeProfileId;
      if (activeId && (snapshot.hostname || sanitizedLocalIp)) {
        const touched = touchProfileHealth(profileStateRef.current, activeId, {
          hostname: snapshot.hostname,
          localIp: sanitizedLocalIp,
        });
        profileStateRef.current = touched;
        setProfileState(touched);
        await gatewayProfiles.save(touched);
      }
      const lanIp =
        sanitizedLocalIp || extractLanIpFromGatewayUrl(resolvedUrl) || undefined;
      const pairHost = pairServerHostFromGatewayUrl(resolvedUrl);
      if (pairHost) {
        await enrichActiveProfileFromPairServer(pairHost);
      } else if (lanIp) {
        await enrichActiveProfileFromPairServer(lanIp);
      }
    } catch (error) {
      publishHealth({
        level: 'red',
        checkedAt: new Date().toISOString(),
        directGatewayReachable: false,
        errorMessage:
          error instanceof Error ? error.message : 'Hermes gateway unreachable on your Wi‑Fi',
      });
    }

    if (token) {
      try {
        const queue = await fetchQueue(currentSettings.cloudUrl, token);
        const workers = normalizeRelayWorkers(queue);
        setRelayWorkers(workers);
        setActiveRelayWorkerId(resolveActiveRelayWorkerId(queue, workers));
      } catch {
        // Account worker list is optional in direct gateway mode.
      }
    }
  }, [enrichActiveProfileFromPairServer, persistDiscoveredGatewayUrl]);

  const stopRelayPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const relayConnectionConfirmedRef = useRef(false);

  const pollRelayQueue = useCallback(async () => {
    const token = mobileTokenRef.current;
    const currentSettings = settingsRef.current;
    if (!token || currentSettings.demoMode) {
      return;
    }

    try {
      const queue = await fetchQueue(currentSettings.cloudUrl, token);
      const workers = normalizeRelayWorkers(queue);
      setRelayWorkers(workers);
      setActiveRelayWorkerId(resolveActiveRelayWorkerId(queue, workers));
      const allPending = queue.events.map(enqueuedEventToPendingApproval);
      const smokeTests = allPending.filter(
        (pending) =>
          isGatewaySmokeTestMessage(pending.reason) ||
          (pending.command && isGatewaySmokeTestMessage(pending.command)),
      );
      const nonSmokeTests = allPending.filter(
        (pending) =>
          !isGatewaySmokeTestMessage(pending.reason) &&
          (!pending.command || !isGatewaySmokeTestMessage(pending.command)),
      );

      setPendingApprovals(dedupeAndCapPendingApprovals(nonSmokeTests));
      relayConnectionConfirmedRef.current = true;
      setConnectionState('connected');
      setLastEventError(undefined);

      for (const pending of smokeTests) {
        if (resolveApprovalRef.current) {
          resolveApprovalRef.current(pending.actionId, 'approve', pending);
        }
      }
    } catch (error) {
      if (error instanceof MobileRelayApiError && error.status === 401) {
        await secureCredentials.clearMobileToken();
        setMobileToken('');
        setRelayWorkers([]);
        setActiveRelayWorkerId(null);
        setConnectionState('disconnected');
        relayConnectionConfirmedRef.current = false;
        setLastEventError('Pairing expired — enter a new code from desktop bridge pairing.');
        stopRelayPolling();
        return;
      }
      setConnectionState('disconnected');
      relayConnectionConfirmedRef.current = false;
      setLastEventError(
        error instanceof Error ? error.message : 'Hermes Mobile cloud relay poll failed',
      );
    }
  }, [stopRelayPolling]);

  const startRelayPolling = useCallback(() => {
    stopRelayPolling();
    const currentSettings = settingsRef.current;
    if (
      !mobileTokenRef.current ||
      currentSettings.demoMode
    ) {
      setRelayWorkers([]);
      setActiveRelayWorkerId(null);
      setConnectionState('disconnected');
      relayConnectionConfirmedRef.current = false;
      return;
    }
    setConnectionState('connected');
    pollRelayQueue();
    pollIntervalRef.current = setInterval(() => {
      pollRelayQueue();
    }, MOBILE_RELAY_POLL_MS);
  }, [pollRelayQueue, stopRelayPolling]);

  useEffect(() => {
    if (!isLoaded) return;
    refreshHealth();
    const interval = setInterval(() => {
      refreshHealth();
    }, 30000);
    const applyNetInfo = (state: NetInfoState) => {
      const isWifi = state.type === 'wifi' && state.isConnected !== false;
      wifiConnectedRef.current = isWifi;
      setWifiConnected(isWifi);
      updateTailscaleVpnActive(state);
    };
    const netSub = NetInfo.addEventListener((state) => {
      applyNetInfo(state);
      refreshHealth();
      void probeTailscaleComputersRef.current({ showUi: false, force: false });
    });
    void NetInfo.fetch().then((state) => {
      applyNetInfo(state);
    });
    return () => {
      clearInterval(interval);
      netSub();
    };
  }, [isLoaded, refreshHealth, updateTailscaleVpnActive]);

  const disconnectEvents = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    stopRelayPolling();
    setRunProgress(null);
    clearRunProgressNotification().catch(() => {});
    if (!settingsRef.current.demoMode && !mobileTokenRef.current) {
      setConnectionState('disconnected');
    }
  }, [stopRelayPolling, setRunProgress]);

  const handleGatewayMessage = useCallback((raw: string) => {
    const event = parseGatewayEvent(raw);
    if (!event) return;

    listenersRef.current.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error invoking gateway listener:', err);
      }
    });

    const pending = gateBlockedToPending(event);
    if (pending) {
      if (!isThumbgateLeashUnlocked(settingsRef.current)) {
        return;
      }
      if (
        isGatewaySmokeTestMessage(pending.reason) ||
        (pending.command && isGatewaySmokeTestMessage(pending.command))
      ) {
        if (resolveApprovalRef.current) {
          resolveApprovalRef.current(pending.actionId, 'approve', pending);
        }
        return;
      }

      const key = pending.runId ?? pending.actionId;
      const isNew = !pendingApprovalsRef.current.some(
        (item) => (item.runId ?? item.actionId) === key,
      );
      if (isNew) {
        haptics.warning();
        if (settingsRef.current.notificationApprovals) {
          emitSignOfLife(`Approval needed: ${pending.reason.slice(0, 80)}`, { haptic: false });
          const appState = AppState.currentState;
          if (
            shouldScheduleApprovalNotification(
              pending,
              appState,
              settingsRef.current.notificationApprovals,
            )
          ) {
            scheduleApprovalNotification(pending, {
              badgeCount: cappedBadgeCount(pendingApprovalsRef.current.length + 1),
              categoryEnabled: settingsRef.current.notificationApprovals,
            }).catch(() => {});
          }
        }
      }

      setPendingApprovals((prev) => {
        if (prev.some((item) => (item.runId ?? item.actionId) === key)) {
          return prev;
        }
        return dedupeAndCapPendingApprovals([pending, ...prev]);
      });
      return;
    }

    const reclaim = parseReclaimEvent(event);
    if (reclaim) {
      setRecentReclaims((prev) => [reclaim, ...prev].slice(0, 20));
    }

    if (event.event === 'TRANSCRIPT.UPDATED') {
      setTranscriptSyncNonce((n) => n + 1);
    }

    const eventName = String(event.event ?? '').toLowerCase();
    const payload = event.payload ?? {};

    if (
      eventName === 'run.completed' ||
      eventName === 'done' ||
      eventName === 'run.failed' ||
      eventName === 'error'
    ) {
      const failed = eventName === 'run.failed' || eventName === 'error';
      const progress = runProgressRef.current;
      const detail =
        progress?.detail?.trim() ||
        (typeof payload.message === 'string' ? payload.message : '') ||
        (failed ? 'Run ended with an error' : 'Task finished');
      if (
        settingsRef.current.notificationCompletion &&
        AppState.currentState !== 'active'
      ) {
        scheduleRunCompletedNotification(detail, {
          success: !failed,
          runId: progress?.runId,
          sessionId: progress?.sessionId,
          categoryEnabled: settingsRef.current.notificationCompletion,
        }).catch(() => {});
      }
      if (!chatStreamProgressActiveRef.current) {
        setRunProgress(null);
        clearRunProgressNotification().catch(() => {});
        cancelRunStallNotification().catch(() => {});
      }
    } else if (
      eventName === 'run.status' ||
      eventName === 'run.progress' ||
      eventName === 'status.update' ||
      eventName === 'provider.waiting' ||
      eventName === 'assistant.delta' ||
      eventName === 'approval.request' ||
      eventName.startsWith('tool.')
    ) {
      if (chatStreamProgressActiveRef.current) {
        return;
      }
      const streamEvt: ChatStreamEvent = {
        event: event.event,
        data: payload,
      };

      setRunProgress((prev) => {
        const dummyState = { runProgress: prev, toolCalls: [] };
        const nextState = applyStreamEvent(dummyState, streamEvt);
        const nextProgress = nextState.runProgress;
        if (nextProgress) {
          return attachRunMetadata(nextProgress, payload, prev);
        }
        return null;
      });
    }
  }, [setRunProgress]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    if (!settings.notificationLiveRunStatus) {
      clearRunProgressNotification().catch(() => {});
      cancelRunStallNotification().catch(() => {});
      return;
    }
    if (!runProgress) {
      clearRunProgressNotification().catch(() => {});
      cancelRunStallNotification().catch(() => {});
      return;
    }
    if (AppState.currentState !== 'active') {
      scheduleRunProgressNotification(runProgress, {
        runId: runProgress.runId,
        sessionId: runProgress.sessionId,
        categoryEnabled: settings.notificationLiveRunStatus,
      }).catch(() => {});
      scheduleRunStallNotification(runProgress.runId, runProgress.sessionId, {
        categoryEnabled: settings.notificationLiveRunStatus,
      }).catch(() => {});
    } else {
      clearRunProgressNotification().catch(() => {});
      cancelRunStallNotification().catch(() => {});
    }
  }, [runProgress, settings.notificationLiveRunStatus]);

  useEffect(() => {
    if (!settings.notificationLiveRunStatus || Platform.OS === 'web') {
      return;
    }

    const handleAppStateChange = (nextAppState: string) => {
      // Never force-post on inactive/background — that peeked a HUD every time the
      // user left the app. Live updates rely on the runProgress effect above (quiet).
      if (nextAppState === 'active') {
        clearRunProgressNotification().catch(() => {});
        cancelRunStallNotification().catch(() => {});
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [settings.notificationLiveRunStatus]);

  const autoDiscoverGateway = useCallback(async (): Promise<string> => {
    const currentUrl = settingsRef.current.gatewayUrl;
    if (settingsRef.current.demoMode) {
      return currentUrl || USB_LOOPBACK_GATEWAY_URL;
    }
    const lastLanIp = await storage.loadLastGatewayLanIp();

    const probe = async (url: string): Promise<string> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1500);
      try {
        const res = await fetch(`${url}/health`, { signal: controller.signal });
        if (res.ok) {
          const body = await res.json();
          if (body && body.status === 'ok') {
            clearTimeout(id);
            return url;
          }
        }
      } catch (_) {
        // Ignore
      }
      clearTimeout(id);
      throw new Error('failed');
    };

    const commitDiscoveredUrl = persistDiscoveredGatewayUrl;

    const activeForDiscovery = activeProfile(profileStateRef.current);
    // Prefer USB ONLY when the active profile is already USB loopback AND phone is on Wi‑Fi.
    // Preferring USB on cellular keeps a ghost 127.0.0.1 primary ("USB Connected" off-cable).
    // Preferring USB when there is no active profile (or after a Tailscale deep-link pair)
    // steals the session to 127.0.0.1: health can be green via adb reverse without a key,
    // chat then 401 → false-green Connected + Wrong key (user crisis 2026-07-14).
    const preferUsbFirst = shouldPreferUsbProbeFirst({
      activeGatewayUrl: activeForDiscovery?.gatewayUrl,
      wifiConnected: wifiConnectedRef.current,
    });

    // 1. Prefer USB only when the user's active computer is already the USB profile
    if (Platform.OS !== 'web' && preferUsbFirst) {
      for (const fallbackUrl of usbLoopbackFallbackUrls(currentUrl || '')) {
        if (!shouldProbeGatewayUrlForActiveProfile(profileStateRef.current, fallbackUrl)) {
          continue;
        }
        try {
          const applied = await commitDiscoveredUrl(await probe(fallbackUrl), true);
          if (healPersistAcceptedProbedUrl(applied, fallbackUrl)) {
            return applied;
          }
        } catch (_) {
          // fall through
        }
      }
    }

    // 2. Remember and prefer the last explicitly user-selected computer
    const lastSelectedId = await storage.loadLastSelectedProfileId();
    let lastSelectedUrl: string | undefined;
    if (lastSelectedId) {
      const preferredProfile = profileStateRef.current.profiles.find((p) => p.id === lastSelectedId);
      if (preferredProfile && preferredProfile.gatewayUrl) {
        lastSelectedUrl = preferredProfile.gatewayUrl;
        try {
          return await commitDiscoveredUrl(await probe(preferredProfile.gatewayUrl), true);
        } catch (_) {
          // fall through
        }
      }
    }

    const skipCurrentLan =
      currentUrl &&
      !isLoopbackGatewayUrl(currentUrl) &&
      shouldSkipLanGatewayProbe(currentUrl, wifiConnectedRef.current);

    // 3. Fallback to current settings URL (if not already tried above)
    if (currentUrl && !skipCurrentLan && currentUrl !== lastSelectedUrl) {
      try {
        return await commitDiscoveredUrl(await probe(currentUrl));
      } catch (_) {
        // fall through
      }
    }

    if (
      Platform.OS !== 'web' &&
      activeForDiscovery &&
      currentUrl &&
      isPrivateLanGatewayUrl(currentUrl) &&
      !isLoopbackGatewayUrl(currentUrl) &&
      !isTailscaleGatewayUrl(currentUrl) &&
      tailnetProbeHostsRef.current.length > 0
    ) {
      const tailDiscovered = await discoverTailscaleGatewayForProfile(
        activeForDiscovery,
        tailnetProbeHostsRef.current,
      );
      if (tailDiscovered?.gatewayUrl && tailDiscovered.gatewayUrl !== currentUrl) {
        try {
          return await commitDiscoveredUrl(await probe(tailDiscovered.gatewayUrl), true);
        } catch (_) {
          // fall through
        }
      }
    }

    if (Platform.OS !== 'web') {
      for (const fallbackUrl of cellularTailscaleFallbackUrls({
        primaryUrl: currentUrl || '',
        wifiConnected: wifiConnectedRef.current,
        profileUrls: profilesForActiveMachine(
          profileStateRef.current.profiles,
          profileStateRef.current.activeProfileId,
        ).map((profile) => profile.gatewayUrl),
        tailnetProbeHosts: tailnetProbeHostsRef.current,
        activeProfileId: profileStateRef.current.activeProfileId,
        profiles: profileStateRef.current.profiles,
      })) {
        if (fallbackUrl === currentUrl) {
          continue;
        }
        if (
          !shouldProbeGatewayUrlForActiveProfile(profileStateRef.current, fallbackUrl)
        ) {
          continue;
        }
        try {
          return await commitDiscoveredUrl(await probe(fallbackUrl), true);
        } catch (_) {
          // fall through
        }
      }
    }

    if (currentUrl && isLoopbackGatewayUrl(currentUrl)) {
      try {
        return await commitDiscoveredUrl(await probe(currentUrl));
      } catch (_) {
        // fall through
      }
    }

    if (
      lastLanIp &&
      shouldProbeGatewayUrlForActiveProfile(
        profileStateRef.current,
        buildGatewayUrlFromLanIp(lastLanIp),
      )
    ) {
      const lastUrl = buildGatewayUrlFromLanIp(lastLanIp);
      if (lastUrl !== currentUrl) {
        try {
          return await commitDiscoveredUrl(await probe(lastUrl), true);
        } catch (_) {
          // fall through
        }
      }
    }

    const savedProfileUrls = profilesForActiveMachine(
      profileStateRef.current.profiles,
      profileStateRef.current.activeProfileId,
    )
      .map((profile) => profile.gatewayUrl)
      .filter((url) => isValidGatewayUrl(url))
      .sort((a, b) => {
        const aLoop = isLoopbackGatewayUrl(a) ? 0 : 1;
        const bLoop = isLoopbackGatewayUrl(b) ? 0 : 1;
        if (aLoop !== bLoop) {
          return aLoop - bLoop;
        }
        if (!wifiConnectedRef.current) {
          const aTs = isTailscaleGatewayUrl(a) ? 0 : 1;
          const bTs = isTailscaleGatewayUrl(b) ? 0 : 1;
          return aTs - bTs;
        }
        return 0;
      });
    const savedCandidates = [...new Set(savedProfileUrls)].filter(
      (url) =>
        url !== currentUrl &&
        url !== (lastLanIp ? buildGatewayUrlFromLanIp(lastLanIp) : '') &&
        isDiscoveredUrlAllowedForActiveProfile(profileStateRef.current, url),
    );
    for (const profileUrl of savedCandidates) {
      try {
        return await commitDiscoveredUrl(await probe(profileUrl), true);
      } catch (_) {
        // Try the next saved computer before falling back to emulator/packager addresses.
      }
    }

    const candidates: string[] = [];
    if (Platform.OS === 'web') {
      candidates.push(USB_LOOPBACK_GATEWAY_URL);
    } else if (Platform.OS === 'android') {
      candidates.push(USB_LOOPBACK_GATEWAY_URL);
      candidates.push('http://10.0.2.2:8642');
    } else {
      candidates.push(USB_LOOPBACK_GATEWAY_URL);
    }

    const packagerIp = getPackagerHostIp();
    if (packagerIp) {
      candidates.push(buildGatewayUrlFromLanIp(packagerIp));
    }

    const tried = new Set<string>([currentUrl, lastLanIp ? buildGatewayUrlFromLanIp(lastLanIp) : '']);
    const uniqueCandidates = [...new Set(candidates)].filter((url) => !tried.has(url));

    try {
      if (uniqueCandidates.length === 0) {
        throw new Error('All failed');
      }
      const successfulUrl = await new Promise<string>((resolve, reject) => {
        let rejectedCount = 0;
        uniqueCandidates.forEach((c) => {
          probe(c)
            .then(resolve)
            .catch(() => {
              rejectedCount++;
              if (rejectedCount === uniqueCandidates.length) {
                reject(new Error('All failed'));
              }
            });
        });
      });
      return await commitDiscoveredUrl(successfulUrl);
    } catch (_) {
      if (Platform.OS !== 'web') {
        const pairUrl = await discoverGatewayViaPairServer(lastLanIp);
        if (pairUrl) {
          return await commitDiscoveredUrl(pairUrl);
        }
        const subnetUrl = await discoverGatewayOnPhoneSubnet(lastLanIp);
        if (subnetUrl) {
          return await commitDiscoveredUrl(subnetUrl);
        }
      }
      return currentUrl;
    }
  }, [persistDiscoveredGatewayUrl]);

  const runConnectionSelfHeal = useCallback(async (allowExhaustedRetry = false) => {
    if (
      !isLoaded ||
      settingsRef.current.demoMode ||
      connectionHealInFlightRef.current ||
      isMacGatewayHttpOk(healthRef.current) ||
      (!allowExhaustedRetry &&
        connectionHealAttemptRef.current >= CONNECTION_HEAL_EXHAUSTED_AFTER)
    ) {
      return;
    }

    // 401 / stale credential: try pair-server refresh (host already discovered),
    // then stop silent "Trying to reach…" and clear poisoned key.
    const wrongKeyPlan = planWrongKeyRecovery({
      authMismatch: healthRef.current?.authMismatch === true,
      errorMessage: healthRef.current?.errorMessage,
      hasSavedProfile: profileStateRef.current.profiles.length > 0,
      hostReachable: true,
    });
    if (wrongKeyPlan.stopSilentHeal) {
      if (wrongKeyPlan.attemptPairServerRefresh) {
        const primaryUrl =
          effectiveGatewayUrlRef.current || settingsRef.current.gatewayUrl;
        const pairHost = pairServerHostFromGatewayUrl(primaryUrl);
        if (pairHost) {
          try {
            const setup = await resolvePairServerSetupParams(pairHost);
            const freshKey = setup?.apiKey?.trim();
            if (freshKey) {
              const gatewayUrl = setup?.gatewayUrl?.trim() || primaryUrl;
              const snapshot = await fetchGatewayHealth(gatewayUrl, freshKey);
              if (!snapshot.authMismatch && isGatewayHealthOk(snapshot)) {
                const nextSettings = {
                  ...settingsRef.current,
                  gatewayUrl,
                  connectionMode: 'gateway' as const,
                };
                await storage.saveGatewaySettings(nextSettings);
                await secureCredentials.saveApiKey(freshKey);
                const activeId = profileStateRef.current.activeProfileId;
                if (activeId) {
                  await secureCredentials.saveProfileApiKey(activeId, freshKey);
                }
                setSettings(nextSettings);
                settingsRef.current = nextSettings;
                setApiKey(freshKey);
                apiKeyRef.current = freshKey;
                effectiveGatewayUrlRef.current = gatewayUrl;
                setEffectiveGatewayUrl(gatewayUrl);
                setHealth(snapshot);
                healthRef.current = snapshot;
                connectionHealAttemptRef.current = 0;
                setConnectionHealAttempt(0);
                setConnectionState('connected');
                setRunProgress((previous) =>
                  previous?.phase === 'sending' ? null : previous,
                );
                setConnectionHealInFlight(false);
                connectionHealInFlightRef.current = false;
                connectEventsRef.current();
                return;
              }
            }
          } catch {
            // fall through to clear stale key + surface Re-pair CTA
          }
        }
      }
      const activeId = profileStateRef.current.activeProfileId;
      if (wrongKeyPlan.clearStaleProfileKey && activeId) {
        try {
          await secureCredentials.removeProfileApiKey(activeId);
        } catch {
          // best-effort
        }
      }
      if (wrongKeyPlan.clearStaleProfileKey) {
        setApiKey('');
        apiKeyRef.current = '';
      }
      connectionHealAttemptRef.current = CONNECTION_HEAL_EXHAUSTED_AFTER;
      setConnectionHealAttempt(CONNECTION_HEAL_EXHAUSTED_AFTER);
      setConnectionHealInFlight(false);
      connectionHealInFlightRef.current = false;
      return;
    }

    connectionHealInFlightRef.current = true;
    setConnectionHealInFlight(true);
    try {
      await probeTailscaleComputersRef.current({ showUi: false, force: true });
      const lastLanIp = await storage.loadLastGatewayLanIp();
      const primaryUrl =
        effectiveGatewayUrlRef.current || settingsRef.current.gatewayUrl;
      const probeUrls = [
        primaryUrl,
        ...buildSelfHealProbeUrls({
          primaryUrl,
          wifiConnected: wifiConnectedRef.current,
          lastLanIp,
          profiles: profileStateRef.current.profiles,
          tailnetProbeHosts: tailnetProbeHostsRef.current,
          activeProfileId: profileStateRef.current.activeProfileId,
        }).filter((url) => url !== primaryUrl),
      ].slice(0, 8);
      for (const url of probeUrls) {
        try {
          const probeKey = await resolveApiKeyForGatewayProbe({
            gatewayUrl: url,
            profiles: profileStateRef.current.profiles,
            activeProfileId: profileStateRef.current.activeProfileId,
            fallbackKey: apiKeyRef.current,
            resolveProfileKey: (profileId) =>
              secureCredentials.resolveApiKeyForProfile(profileId),
          });
          if (probeKey !== apiKeyRef.current) {
            setApiKey(probeKey);
            apiKeyRef.current = probeKey;
          }
          const snapshot = await fetchGatewayHealth(url, probeKey);
          if (snapshot.authMismatch) {
            const plan = planWrongKeyRecovery({
              authMismatch: true,
              errorMessage: snapshot.errorMessage,
              hasSavedProfile: true,
              hostReachable: true,
            });
            if (plan.attemptPairServerRefresh) {
              const pairHost = pairServerHostFromGatewayUrl(url);
              if (pairHost) {
                try {
                  const setup = await resolvePairServerSetupParams(pairHost);
                  const freshKey = setup?.apiKey?.trim();
                  if (freshKey) {
                    const refreshed = await fetchGatewayHealth(url, freshKey);
                    if (!refreshed.authMismatch && isGatewayHealthOk(refreshed)) {
                      await secureCredentials.saveApiKey(freshKey);
                      const activeId = profileStateRef.current.activeProfileId;
                      if (activeId) {
                        await secureCredentials.saveProfileApiKey(activeId, freshKey);
                      }
                      setApiKey(freshKey);
                      apiKeyRef.current = freshKey;
                      await persistDiscoveredGatewayUrl(url, true);
                      setHealth(refreshed);
                      healthRef.current = refreshed;
                      connectionHealAttemptRef.current = 0;
                      setConnectionHealAttempt(0);
                      setConnectionState('connected');
                      setRunProgress((previous) =>
                        previous?.phase === 'sending' ? null : previous,
                      );
                      connectEventsRef.current();
                      return;
                    }
                  }
                } catch {
                  // fall through to clear + surface Re-pair
                }
              }
            }
            if (plan.clearStaleProfileKey) {
              const activeId = profileStateRef.current.activeProfileId;
              if (activeId) {
                try {
                  await secureCredentials.removeProfileApiKey(activeId);
                } catch {
                  // best-effort
                }
              }
              setApiKey('');
              apiKeyRef.current = '';
            }
            setHealth(snapshot);
            healthRef.current = snapshot;
            connectionHealAttemptRef.current = CONNECTION_HEAL_EXHAUSTED_AFTER;
            setConnectionHealAttempt(CONNECTION_HEAL_EXHAUSTED_AFTER);
            return;
          }
          if (!isGatewayHealthOk(snapshot)) {
            continue;
          }
          const applied = await persistDiscoveredGatewayUrl(url, true);
          // Catalog-only (e.g. Pro USB while mini is active) must not flip Connected/health.
          if (!healPersistAcceptedProbedUrl(applied, url)) {
            continue;
          }
          // Never override auth probe — fetchGatewayHealth already sets directGatewayReachable.
          setHealth(snapshot);
          healthRef.current = snapshot;
          connectionHealAttemptRef.current = 0;
          setConnectionHealAttempt(0);
          setConnectionState('connected');
          setRunProgress((previous) =>
            previous?.phase === 'sending' ? null : previous,
          );
          connectEventsRef.current();
          return;
        } catch {
          // silent failover
        }
      }
      await autoDiscoverGateway();
      await refreshHealth();
      if (isGatewayHealthOk(healthRef.current)) {
        connectionHealAttemptRef.current = 0;
        setConnectionHealAttempt(0);
        setConnectionState('connected');
        setRunProgress((previous) =>
          previous?.phase === 'sending' ? null : previous,
        );
        connectEventsRef.current();
        return;
      }
      connectionHealAttemptRef.current += 1;
      setConnectionHealAttempt(connectionHealAttemptRef.current);
    } finally {
      connectionHealInFlightRef.current = false;
      setConnectionHealInFlight(false);
    }
  }, [autoDiscoverGateway, isLoaded, persistDiscoveredGatewayUrl, refreshHealth]);

  /**
   * Product lock: Connected via Tailscale/LAN + same-Mac USB reverse healthy →
   * switch effective chat URL to USB without changing activeProfileId / clearing chat.
   * Runs on Wi‑Fi and cellular — live USB hostname is the ghost guard.
   */
  const maybeHandoffTailscaleToUsb = useCallback(async (): Promise<boolean> => {
    if (
      Platform.OS === 'web' ||
      !isLoaded ||
      settingsRef.current.demoMode ||
      usbHandoffInFlightRef.current
    ) {
      return false;
    }
    const currentUrl =
      effectiveGatewayUrlRef.current.trim() || settingsRef.current.gatewayUrl.trim();
    if (!isUsbHandoffSourceUrl(currentUrl)) {
      return false;
    }
    // Upgrade path only — disconnected Macs use runConnectionSelfHeal.
    if (!isMacGatewayHttpOk(healthRef.current)) {
      return false;
    }

    usbHandoffInFlightRef.current = true;
    try {
      const discovery = await probeLiveUsbGateway();
      const active = activeProfile(profileStateRef.current);
      const decision = resolveUsbTransportHandoff({
        currentGatewayUrl: currentUrl,
        wifiConnected: wifiConnectedRef.current,
        liveUsbReachable: Boolean(discovery),
        liveUsbHostname: discovery?.hostname,
        activeProfile: active,
      });
      if (!decision.shouldHandoff) {
        return false;
      }

      const probeKey = await resolveApiKeyForGatewayProbe({
        gatewayUrl: decision.usbGatewayUrl,
        profiles: profileStateRef.current.profiles,
        activeProfileId: profileStateRef.current.activeProfileId,
        fallbackKey: apiKeyRef.current,
        resolveProfileKey: (profileId) => secureCredentials.resolveApiKeyForProfile(profileId),
      });
      if (probeKey !== apiKeyRef.current) {
        setApiKey(probeKey);
        apiKeyRef.current = probeKey;
      }
      const snapshot = await fetchGatewayHealth(decision.usbGatewayUrl, probeKey);
      if (snapshot.authMismatch || !isGatewayHealthOk(snapshot)) {
        return false;
      }
      const healthHost = snapshot.hostname?.trim() || discovery?.hostname?.trim();
      const confirmed = resolveUsbTransportHandoff({
        currentGatewayUrl: currentUrl,
        wifiConnected: wifiConnectedRef.current,
        liveUsbReachable: true,
        liveUsbHostname: healthHost,
        activeProfile: active,
      });
      if (!confirmed.shouldHandoff) {
        return false;
      }

      const priorActiveId = profileStateRef.current.activeProfileId;
      // Catalog-only upsert: keep Tailscale/LAN identity; do not activate a USB profile row.
      const upserted = applyHealDiscoveredUrl(
        profileStateRef.current,
        {
          gatewayUrl: confirmed.usbGatewayUrl,
          hostname: healthHost,
          localIp: '127.0.0.1',
          label: active?.label,
        },
        false,
      );
      const nextState: GatewayProfileState = {
        ...upserted,
        activeProfileId: priorActiveId ?? upserted.activeProfileId,
      };
      profileStateRef.current = nextState;
      setProfileState(nextState);
      await gatewayProfiles.save(nextState);

      const nextSettings = {
        ...settingsRef.current,
        gatewayUrl: confirmed.usbGatewayUrl,
      };
      await storage.saveGatewaySettings(nextSettings);
      setSettings(nextSettings);
      settingsRef.current = nextSettings;
      effectiveGatewayUrlRef.current = confirmed.usbGatewayUrl;
      setEffectiveGatewayUrl(confirmed.usbGatewayUrl);
      setHealth(snapshot);
      healthRef.current = snapshot;
      setConnectionState('connected');
      connectEventsRef.current();
      return true;
    } catch {
      return false;
    } finally {
      usbHandoffInFlightRef.current = false;
    }
  }, [isLoaded]);

  /**
   * Product lock (vice versa): USB reverse gone → restore same-Mac Tailscale/LAN
   * without changing activeProfileId / clearing chat.
   */
  const maybeHandoffUsbToRemote = useCallback(async (): Promise<boolean> => {
    if (
      Platform.OS === 'web' ||
      !isLoaded ||
      settingsRef.current.demoMode ||
      usbHandoffInFlightRef.current
    ) {
      return false;
    }
    const currentUrl =
      effectiveGatewayUrlRef.current.trim() || settingsRef.current.gatewayUrl.trim();
    if (!isLoopbackGatewayUrl(currentUrl)) {
      return false;
    }

    usbHandoffInFlightRef.current = true;
    try {
      const discovery = await probeLiveUsbGateway();
      if (discovery) {
        return false;
      }
      const active = activeProfile(profileStateRef.current);
      const remoteGatewayUrl = resolveSameMachineRemoteUrl({
        activeProfile: active,
        candidateUrls: profilesForActiveMachine(
          profileStateRef.current.profiles,
          profileStateRef.current.activeProfileId,
        ).map((profile) => profile.gatewayUrl),
      });
      const decision = resolveUsbToRemoteHandoff({
        currentGatewayUrl: currentUrl,
        liveUsbReachable: false,
        activeProfile: active,
        remoteGatewayUrl,
      });
      if (!decision.shouldHandoff) {
        return false;
      }

      const probeKey = await resolveApiKeyForGatewayProbe({
        gatewayUrl: decision.remoteGatewayUrl,
        profiles: profileStateRef.current.profiles,
        activeProfileId: profileStateRef.current.activeProfileId,
        fallbackKey: apiKeyRef.current,
        resolveProfileKey: (profileId) => secureCredentials.resolveApiKeyForProfile(profileId),
      });
      if (probeKey !== apiKeyRef.current) {
        setApiKey(probeKey);
        apiKeyRef.current = probeKey;
      }
      const snapshot = await fetchGatewayHealth(decision.remoteGatewayUrl, probeKey);
      if (snapshot.authMismatch || !isGatewayHealthOk(snapshot)) {
        return false;
      }

      const priorActiveId = profileStateRef.current.activeProfileId;
      const upserted = applyHealDiscoveredUrl(
        profileStateRef.current,
        {
          gatewayUrl: decision.remoteGatewayUrl,
          hostname: snapshot.hostname?.trim() || active?.hostname,
          localIp: active?.localIp,
          label: active?.label,
        },
        false,
      );
      const nextState: GatewayProfileState = {
        ...upserted,
        activeProfileId: priorActiveId ?? upserted.activeProfileId,
      };
      profileStateRef.current = nextState;
      setProfileState(nextState);
      await gatewayProfiles.save(nextState);

      const nextSettings = {
        ...settingsRef.current,
        gatewayUrl: decision.remoteGatewayUrl,
      };
      await storage.saveGatewaySettings(nextSettings);
      setSettings(nextSettings);
      settingsRef.current = nextSettings;
      effectiveGatewayUrlRef.current = decision.remoteGatewayUrl;
      setEffectiveGatewayUrl(decision.remoteGatewayUrl);
      setHealth(snapshot);
      healthRef.current = snapshot;
      setConnectionState('connected');
      connectEventsRef.current();
      return true;
    } catch {
      return false;
    } finally {
      usbHandoffInFlightRef.current = false;
    }
  }, [isLoaded]);

  const runBidirectionalUsbHandoff = useCallback(async () => {
    const toUsb = await maybeHandoffTailscaleToUsbRef.current();
    if (!toUsb) {
      await maybeHandoffUsbToRemoteRef.current();
    }
  }, []);

  const connectGatewayWebSocket = useCallback(async () => {
    disconnectEvents();
    setLastEventError(undefined);

    const currentSettings = settingsRef.current;
    if (currentSettings.demoMode) {
      setConnectionState('demo');
      return;
    }

    await refreshHealth();
    const httpOk = isGatewayHealthOk(healthRef.current);

    const activeUrl = await autoDiscoverGateway();
    effectiveGatewayUrlRef.current = activeUrl;
    setEffectiveGatewayUrl(activeUrl);
    const wsUrl = buildEventsWebSocketUrl(activeUrl);

    // HTTP chat works without the live socket. This gateway exposes no events
    // WebSocket (live updates arrive via SSE on the chat/run streams), so a
    // reachable /health is the real connection signal — treat it as connected
    // instead of waiting on a socket.onopen that may never fire.
    if (httpOk) {
      setConnectionState('connected');
    } else {
      setConnectionState('connecting');
    }

    try {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        setConnectionState('connected');
        setLastEventError(undefined);
        refreshHealth();
      };

      socket.onmessage = (message) => {
        if (socketRef.current !== socket) return;
        if (typeof message.data === 'string') {
          handleGatewayMessage(message.data);
        }
      };

      socket.onerror = () => {
        if (socketRef.current !== socket) return;
        const loopback = isLoopbackGatewayUrl(activeUrl);
        if (!loopback) {
          setLastEventError(
            isGatewayHealthOk(healthRef.current)
              ? undefined
              : 'Live link interrupted — pull down on Leash to retry.',
          );
        } else {
          // Loopback/USB: this gateway has no events socket, so a WS error is
          // expected and meaningless while HTTP chat is healthy. Only surface the
          // fallback hint when the Mac is genuinely unreachable over HTTP.
          setLastEventError(
            isGatewayHealthOk(healthRef.current)
              ? undefined
              : 'Phone cannot use 127.0.0.1 for your computer. Use Hermes Relay or scan that computer QR for direct fallback.',
          );
        }
        if (!isGatewayHealthOk(healthRef.current)) {
          setConnectionState('disconnected');
        }
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
          const stillHttpOk = isGatewayHealthOk(healthRef.current);
          if (!stillHttpOk) {
            setConnectionState('disconnected');
          }

          if (!settingsRef.current.demoMode) {
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            const retryMs = stillHttpOk ? 60000 : 5000;
            reconnectTimeoutRef.current = setTimeout(() => {
              connectEventsRef.current();
            }, retryMs);
          }
        }
      };
    } catch (error) {
      setLastEventError(error instanceof Error ? error.message : 'Failed to open WebSocket');
      if (!isGatewayHealthOk(healthRef.current)) {
        setConnectionState('disconnected');
      }
    }
  }, [disconnectEvents, handleGatewayMessage, autoDiscoverGateway, refreshHealth]);

  const connectEvents = useCallback(() => {
    const currentSettings = settingsRef.current;
    const token = mobileTokenRef.current;

    if (currentSettings.demoMode) {
      disconnectEvents();
      setConnectionState('demo');
      return;
    }

    if (currentSettings.connectionMode === 'relay') {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (token) {
        startRelayPolling();
      } else {
        stopRelayPolling();
        setConnectionState('disconnected');
        setLastEventError('Not paired — run desktop bridge pairing and enter the code in Settings.');
      }
      return;
    }

    stopRelayPolling();
    connectGatewayWebSocket();
  }, [
    connectGatewayWebSocket,
    disconnectEvents,
    startRelayPolling,
    stopRelayPolling,
  ]);

  useEffect(() => {
    connectEventsRef.current = connectEvents;
  }, [connectEvents]);

  useEffect(() => {
    if (!isLoaded || !bootstrapReady) return;
    connectEvents();
    return () => disconnectEvents();
  }, [isLoaded, bootstrapReady, connectEvents, disconnectEvents, mobileToken, settings.connectionMode, settings.thumbgateProActive]);

  useEffect(() => {
    if (!isLoaded || settings.thumbgateProActive) {
      return;
    }
    setPendingApprovals([]);
  }, [isLoaded, settings.thumbgateProActive]);

  /** Don't leave the UI stuck on "Connecting…" when the live link never opens. */
  useEffect(() => {
    if (
      settings.demoMode ||
      settings.connectionMode === 'relay' ||
      connectionState !== 'connecting'
    ) {
      return;
    }
    if (isGatewayHealthOk(healthRef.current)) {
      return;
    }
    const timer = setTimeout(() => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setConnectionState('disconnected');
        refreshHealth();
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [connectionState, settings.demoMode, refreshHealth]);

  useEffect(() => {
    if (!isLoaded || settings.demoMode || isMacGatewayHttpOk(health)) {
      if (isMacGatewayHttpOk(health)) {
        connectionHealAttemptRef.current = 0;
        setConnectionHealAttempt(0);
      }
      return;
    }
    const activeProfileId = profileStateRef.current.activeProfileId;
    const hasSavedActiveProfile =
      activeProfileId !== null &&
      profileStateRef.current.profiles.some((profile) => profile.id === activeProfileId);
    const canProbeSavedProfile =
      hasSavedActiveProfile && healthRef.current?.authMismatch !== true;

    if (connectionHealAttempt >= CONNECTION_HEAL_EXHAUSTED_AFTER) {
      if (!canProbeSavedProfile) {
        return;
      }
      const reconnectInterval = setInterval(() => {
        void runConnectionSelfHeal(true);
      }, SAVED_PROFILE_RECONNECT_INTERVAL_MS);
      return () => clearInterval(reconnectInterval);
    }
    void runConnectionSelfHeal();
    const interval = setInterval(() => {
      if (connectionHealAttemptRef.current >= CONNECTION_HEAL_EXHAUSTED_AFTER) {
        return;
      }
      void runConnectionSelfHeal();
    }, CONNECTION_SELF_HEAL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [
    isLoaded,
    settings.demoMode,
    health?.level,
    health?.checkedAt,
    health?.directGatewayReachable,
    wifiConnected,
    connectionHealAttempt,
    profileState.activeProfileId,
    profileState.profiles.length,
    runConnectionSelfHeal,
  ]);

  const autoConnectGateway = useCallback(async () => {
    return autoDiscoverGateway();
  }, [autoDiscoverGateway]);

  const saveSettings = useCallback(
    async (nextSettings: GatewaySettings, nextApiKey: string, nextThumbgateApiKey?: string) => {
      const persistedSettings = sanitizeDemoModeForRelease(
        withDerivedNotificationsEnabled(nextSettings),
      );
      await storage.saveGatewaySettings(persistedSettings);
      await secureCredentials.saveApiKey(nextApiKey);
      if (nextThumbgateApiKey !== undefined) {
        await secureCredentials.saveThumbgateApiKey(nextThumbgateApiKey);
        thumbgateApiKeyRef.current = nextThumbgateApiKey;
        setThumbgateApiKey(nextThumbgateApiKey);
      }
      setSettings(persistedSettings);
      setApiKey(nextApiKey);
      settingsRef.current = persistedSettings;
      apiKeyRef.current = nextApiKey;
      const lanIp = extractLanIpFromGatewayUrl(persistedSettings.gatewayUrl);
      if (lanIp) {
        await storage.saveLastGatewayLanIp(lanIp);
      }

      const activeId = profileStateRef.current.activeProfileId;
      if (activeId) {
        await secureCredentials.saveProfileApiKey(activeId, nextApiKey);
      }

      // Stale /health from the previous Mac must not rename the URL we just saved
      // (selecting mini while healthRef still says MacBook Pro → dedupe steal).
      const matchedForUrl = findProfileForGatewayUrl(
        profileStateRef.current.profiles,
        persistedSettings.gatewayUrl,
      );
      const healthHost = healthRef.current?.hostname?.trim();
      const hostnameForHeal =
        matchedForUrl &&
        healthHost &&
        shouldAcceptHealthIdentityForProfile(matchedForUrl, { hostname: healthHost })
          ? healthHost
          : matchedForUrl?.hostname;

      const upserted = applyHealDiscoveredUrl(
        profileStateRef.current,
        {
          gatewayUrl: persistedSettings.gatewayUrl,
          localIp: lanIp ?? undefined,
          hostname: hostnameForHeal,
        },
        !profileStateRef.current.activeProfileId,
      );
      profileStateRef.current = upserted;
      setProfileState(upserted);
      await gatewayProfiles.save(upserted);

      effectiveGatewayUrlRef.current = persistedSettings.gatewayUrl;
      setEffectiveGatewayUrl(persistedSettings.gatewayUrl);
      await refreshHealth();
      connectEvents();
    },
    [connectEvents, refreshHealth],
  );

  const patchSettings = useCallback(
    async (patch: Partial<GatewaySettings>) => {
      const nextSettings = { ...settingsRef.current, ...patch };
      await saveSettings(nextSettings, apiKeyRef.current);
    },
    [saveSettings],
  );

  const activateDeveloperLeashUnlock = useCallback(async () => {
    const nextSettings = {
      ...withDeveloperLeashUnlocked(settingsRef.current),
      thumbgateProActive: true,
    };
    if (
      nextSettings.developerLeashUnlock === settingsRef.current.developerLeashUnlock &&
      nextSettings.thumbgateProActive === settingsRef.current.thumbgateProActive
    ) {
      return;
    }
    await saveSettings(nextSettings, apiKeyRef.current);
    haptics.success();
  }, [saveSettings]);

  const selectGatewayProfile = useCallback(
    async (
      profileId: string,
      options?: { ensureProfile?: GatewayProfile },
    ): Promise<boolean> => {
      if (settingsRef.current.demoMode) {
        const nextSettings: GatewaySettings = {
          ...settingsRef.current,
          demoMode: false,
        };
        await saveSettings(nextSettings, apiKeyRef.current);
      }
      let profile = profileStateRef.current.profiles.find((p) => p.id === profileId);
      // Live USB / discovery rows are often synthesized for the picker and not yet saved.
      // Upsert ensureProfile so the tap is never a silent no-op — but NEVER fall back to an
      // unrelated USB row when the user tapped Tailscale Mac mini (2026-07-21 switch rage).
      if (!profile && options?.ensureProfile) {
        const ensure = options.ensureProfile;
        const ensuredState = upsertDiscoveredProfile(
          profileStateRef.current,
          {
            gatewayUrl: ensure.gatewayUrl,
            hostname: ensure.hostname,
            label: ensure.label,
            localIp: ensure.localIp ?? (isLoopbackGatewayUrl(ensure.gatewayUrl) ? '127.0.0.1' : undefined),
          },
          false,
        );
        profileStateRef.current = ensuredState;
        setProfileState(ensuredState);
        profile = resolveProfileAfterEnsureUpsert({
          state: ensuredState,
          requestedProfileId: profileId,
          ensure,
        });
      }
      if (!profile) {
        setLastEventError(
          'Could not switch computers. Tap Find computers, then try again.',
        );
        haptics.warning();
        return false;
      }
      const selectedId = profile.id;
      const nextState = selectProfile(profileStateRef.current, selectedId);
      profileStateRef.current = nextState;
      setProfileState(nextState);

      const currentEffective = effectiveGatewayUrlRef.current;
      const healthHostname = healthRef.current?.hostname?.trim();
      const healthOk = isMacGatewayHttpOk(healthRef.current);
      let targetGatewayUrl = profile.gatewayUrl;
      if (
        isLoopbackGatewayUrl(currentEffective) &&
        healthOk &&
        healthHostname &&
        profileMatchesHostname(profile, healthHostname)
      ) {
        // Keep USB route, but logical identity switches to selected profile
        targetGatewayUrl = currentEffective;
      }

      const nextSettings: GatewaySettings = {
        ...settingsRef.current,
        gatewayUrl: targetGatewayUrl,
        demoMode: false,
      };
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      effectiveGatewayUrlRef.current = targetGatewayUrl;
      setEffectiveGatewayUrl(targetGatewayUrl);
      setConnectionState('connecting');

      await gatewayProfiles.save(nextState);
      await storage.saveLastSelectedProfileId(selectedId);

      const profileKey = await secureCredentials.resolveApiKeyForProfile(selectedId);
      await saveSettings(nextSettings, profileKey || apiKeyRef.current);
      haptics.success();
      return true;
    },
    [saveSettings],
  );

  useEffect(() => {
    selectGatewayProfileRef.current = selectGatewayProfile;
  }, [selectGatewayProfile]);

  const removeGatewayProfile = useCallback(
    async (profileId: string) => {
      const wasActive = profileStateRef.current.activeProfileId === profileId;
      const nextState = removeProfile(profileStateRef.current, profileId);
      await secureCredentials.removeProfileApiKey(profileId);
      profileStateRef.current = nextState;
      setProfileState(nextState);
      await gatewayProfiles.save(nextState);

      if (wasActive) {
        const nextActive = activeProfile(nextState);
        if (nextActive) {
          await selectGatewayProfile(nextActive.id);
        }
      }
      haptics.light();
    },
    [selectGatewayProfile],
  );

  const addGatewayProfile = useCallback(
    async (label: string, gatewayUrl: string) => {
      if (!isValidGatewayUrl(gatewayUrl)) {
        setLastEventError(
          'That computer URL is incomplete. Use http://YOUR-MAC-IP:8642 or a Tailscale address.',
        );
        return;
      }
      const state = profileStateRef.current;
      const nextState = upsertDiscoveredProfile(
        state,
        {
          gatewayUrl,
          label,
        },
        true,
      );
      profileStateRef.current = nextState;
      setProfileState(nextState);
      await gatewayProfiles.save(nextState);

      const active = activeProfile(nextState);
      if (active) {
        await selectGatewayProfile(active.id);
      }
    },
    [selectGatewayProfile],
  );

  const scanForGatewayProfiles = useCallback(async (): Promise<GatewayProfile[]> => {
    setProfileScanning(true);
    setProfileScanResult(null);
    setProfileScanProgress({
      stage: 'pair_server',
      completedHosts: 0,
      totalHosts: 0,
      foundCount: 0,
    });
    try {
      const lastLanIp = await storage.loadLastGatewayLanIp();
      const preScanTailnet = tailnetProbeHostsRef.current.length
        ? tailnetProbeHostsRef.current
        : await tailnetProbeStorage.load();
      const { gateways: discovered, tailnetProbeHosts } = await discoverAllGatewaysOnLan(
        lastLanIp,
        {
          onProgress: setProfileScanProgress,
          tailnetPairServerHosts: preScanTailnet,
        },
      );
      if (tailnetProbeHosts.length > 0) {
        const merged = await tailnetProbeStorage.merge(tailnetProbeHosts);
        tailnetProbeHostsRef.current = merged;
        setTailnetProbeHostCount(merged.length);
      }
      let state = profileStateRef.current;
      for (const item of discovered) {
        state = upsertDiscoveredProfile(state, item, false);
      }
      // Probe known Tailscale hosts for their /health hostname so raw 100.x CGNAT IPs show the
      // real machine name instead of a nameless "Computer <IP>". Reuses the
      // existing per-host probe; unreachable hosts return null and are skipped.
      if (tailnetProbeHostsRef.current.length > 0) {
        try {
          const namedTailscale = await discoverTailscaleGateways(tailnetProbeHostsRef.current);
          for (const item of namedTailscale) {
            if (item.hostname) {
              state = upsertDiscoveredProfile(state, item, false);
            }
          }
        } catch {
          // Naming is best-effort; a probe failure must never break discovery.
        }
      }
      state = dedupeGatewayProfiles(state);
      const active = activeProfile(state);
      const lanMatch =
        active &&
        isLoopbackGatewayUrl(active.gatewayUrl) &&
        wifiConnectedRef.current
          ? discovered.find(
              (item) =>
                !isLoopbackGatewayUrl(item.gatewayUrl) &&
                profileMatchesDiscoveredGateway(active, item),
            )
          : undefined;
      if (lanMatch) {
        state = upsertDiscoveredProfile(state, lanMatch, false);
        state = dedupeGatewayProfiles(state);
      }
      profileStateRef.current = state;
      setProfileState(state);
      await gatewayProfiles.save(state);
      if (lanMatch) {
        await persistDiscoveredGatewayUrl(lanMatch.gatewayUrl, false);
      }
      const reach = summarizeDiscoveredReach(discovered);
      setProfileScanResult({
        foundCount: reach.foundCount,
        lanCount: reach.lanCount,
        tailscaleCount: reach.tailscaleCount,
        usbCount: reach.usbCount,
        completedAtMs: Date.now(),
      });
      void trackProductEvent('mac_scan_complete', {
        found_count: reach.foundCount,
        lan_count: reach.lanCount,
        tailscale_count: reach.tailscaleCount,
        usb_count: reach.usbCount,
      });
      if (reach.foundCount > 0) {
        haptics.success();
      } else {
        haptics.light();
      }
      return state.profiles;
    } finally {
      setProfileScanning(false);
      setProfileScanProgress(null);
      void probeTailscaleComputersRef.current({ showUi: false, force: false });
    }
  }, [persistDiscoveredGatewayUrl]);

  const probeTailscaleComputers = useCallback(
    async (options?: ProbeTailscaleComputersOptions) => {
    const showUi = options?.showUi ?? true;
    const force = options?.force ?? true;
    if (settingsRef.current.demoMode) {
      return;
    }
    if (
      !force &&
      !shouldRunBackgroundTailscaleProbe({
        lastAtMs: lastTailscaleProbeAtMsRef.current,
        nowMs: Date.now(),
      })
    ) {
      return;
    }
    if (tailscaleProbeInFlightRef.current) {
      return;
    }
    tailscaleProbeInFlightRef.current = true;
    lastTailscaleProbeAtMsRef.current = Date.now();
    try {
      let storedHosts =
        tailnetProbeHostsRef.current.length > 0
          ? tailnetProbeHostsRef.current
          : await tailnetProbeStorage.load();
      tailnetProbeHostsRef.current = storedHosts;

      // Preflight: Samsung NetInfo often stays `cellular` while tun0 is up. Prove
      // the tunnel with one quick host probe BEFORE flipping probing=true, so the
      // picker does not flash "Tailscale is off" (computerPickerStatus gates on
      // vpnActive while probing).
      const preflightHosts = expandTailnetProbeHosts(
        collectTailnetProbeHosts(profileStateRef.current.profiles, storedHosts),
      ).slice(0, 3);
      if (preflightHosts.length > 0) {
        const preflightHits = await discoverTailscaleGateways(preflightHosts);
        reachedTailscaleHostRef.current = preflightHits.some((item) =>
          isTailscaleGatewayUrl(item.gatewayUrl),
        );
        updateTailscaleVpnActive();
      }
      if (showUi) {
        setTailscaleDiscoveryProbing(true);
      }

      if (storedHosts.length === 0) {
        const lastLanIp = await storage.loadLastGatewayLanIp();
        const { tailnetProbeHosts } = await discoverAllGatewaysOnLan(lastLanIp, {
          tailnetPairServerHosts: collectTailnetProbeHosts(profileStateRef.current.profiles),
        });
        if (tailnetProbeHosts.length > 0) {
          storedHosts = await mergeTailnetProbeHostsFromScan(
            tailnetProbeHosts,
            tailnetProbeStorage,
            tailnetProbeHostsRef,
          );
        }
      }
      if (storedHosts.length === 0) {
        const boot = await bootstrapTailnetProbeHostsFromPairServers(
          collectTailnetProbeHosts(profileStateRef.current.profiles),
        );
        if (boot.tailnetProbeHosts.length > 0) {
          storedHosts = await mergeTailnetProbeHostsFromScan(
            boot.tailnetProbeHosts,
            tailnetProbeStorage,
            tailnetProbeHostsRef,
          );
        }
      } else {
        const boot = await bootstrapTailnetProbeHostsFromPairServers(storedHosts);
        if (boot.tailnetProbeHosts.length > storedHosts.length) {
          storedHosts = await mergeTailnetProbeHostsFromScan(
            boot.tailnetProbeHosts,
            tailnetProbeStorage,
            tailnetProbeHostsRef,
          );
        }
      }
      setTailnetProbeHostCount(storedHosts.length);

      let probeHosts = expandTailnetProbeHosts(
        collectTailnetProbeHosts(
          profileStateRef.current.profiles,
          storedHosts,
        ),
      );
      if (probeHosts.length === 0) {
        const boot = await bootstrapTailnetProbeHostsFromPairServers(storedHosts);
        if (boot.tailnetProbeHosts.length > 0) {
          storedHosts = await mergeTailnetProbeHostsFromScan(
            boot.tailnetProbeHosts,
            tailnetProbeStorage,
            tailnetProbeHostsRef,
          );
          setTailnetProbeHostCount(storedHosts.length);
          probeHosts = expandTailnetProbeHosts(
            collectTailnetProbeHosts(
              profileStateRef.current.profiles,
              storedHosts,
            ),
          );
        }
      }
      if (probeHosts.length === 0) {
        reachedTailscaleHostRef.current = false;
        updateTailscaleVpnActive();
        setTailscaleDiscoveries([]);
        return;
      }
      const discovered = await discoverTailscaleGateways(probeHosts);
      reachedTailscaleHostRef.current = discovered.some((item) =>
        isTailscaleGatewayUrl(item.gatewayUrl),
      );
      updateTailscaleVpnActive();
      const hostsToPersist = tailnetHostsFromDiscoveries(discovered);
      if (hostsToPersist.length > 0) {
        const mergedHosts = await tailnetProbeStorage.merge(
          collectTailnetProbeHosts(
            profileStateRef.current.profiles,
            [...storedHosts, ...hostsToPersist],
          ),
        );
        tailnetProbeHostsRef.current = mergedHosts;
        setTailnetProbeHostCount(mergedHosts.length);
      }
      // Fresh install: never silent-save Tailscale /health hits as gatewayProfiles
      // (that invents a named Mac + Outdated connection before the user pairs).
      // Returning users may persist discoveries that match an already-saved Mac.
      const { toPersist } = partitionSilentDiscoveries(
        profileStateRef.current.profiles,
        discovered,
      );
      if (toPersist.length > 0) {
        const nextState = applyTailscaleDiscoveriesToProfileState(
          profileStateRef.current,
          toPersist,
        );
        profileStateRef.current = nextState;
        setProfileState(nextState);
        await gatewayProfiles.save(nextState);
      }
      // USB→Tailscale on cellular must run when reverse is *dead* (ghost 127.0.0.1).
      // Never yank a live cable path — product lock prefers USB when reverse is healthy.
      const activeAfter = activeProfile(profileStateRef.current);
      const priorUrl =
        effectiveGatewayUrlRef.current.trim() || settingsRef.current.gatewayUrl.trim();
      const failoverUrl = resolveCellularTailscaleFailoverUrl({
        primaryUrl: priorUrl,
        profiles: profileStateRef.current.profiles,
        activeProfile: activeAfter,
        discoveries: discovered,
      });
      let liveUsbConfirmed = false;
      if (isLoopbackGatewayUrl(priorUrl)) {
        const liveUsb = await probeLiveUsbGateway();
        liveUsbConfirmed = Boolean(liveUsb?.hostname?.trim());
      }
      if (
        failoverUrl &&
        failoverUrl !== priorUrl &&
        !liveUsbConfirmed &&
        (shouldClearUsbPrimaryOnCellular({
          primaryUrl: priorUrl,
          wifiConnected: wifiConnectedRef.current,
          failoverUrl,
          liveUsbConfirmed,
        }) ||
          !wifiConnectedRef.current ||
          isPrivateLanGatewayUrl(priorUrl))
      ) {
        await persistDiscoveredGatewayUrl(failoverUrl, true);
        void refreshHealth();
      }
      const fresh = filterNewTailscaleDiscoveries(profileStateRef.current.profiles, discovered);
      setTailscaleDiscoveries(fresh);
    } finally {
      tailscaleProbeInFlightRef.current = false;
      if (showUi) {
        setTailscaleDiscoveryProbing(false);
      }
    }
  },
  [persistDiscoveredGatewayUrl, refreshHealth, updateTailscaleVpnActive],
  );

  const addDiscoveredTailscaleComputer = useCallback(async (discovery: DiscoveredGateway) => {
    // Catalog + activate — "Add" must switch, not leave the user stuck on MacBook USB.
    const cataloged = upsertDiscoveredProfile(profileStateRef.current, discovery, false);
    profileStateRef.current = cataloged;
    setProfileState(cataloged);
    await gatewayProfiles.save(cataloged);
    setTailscaleDiscoveries((prev) =>
      prev.filter((item) => item.gatewayUrl !== discovery.gatewayUrl),
    );
    const ensure: GatewayProfile = {
      id: profileIdFromGatewayUrl(discovery.gatewayUrl, discovery.hostname),
      label: discovery.label || discovery.hostname || 'Computer',
      gatewayUrl: discovery.gatewayUrl,
      hostname: discovery.hostname,
      localIp: discovery.localIp,
      addedAt: new Date().toISOString(),
    };
    const matched =
      resolveProfileAfterEnsureUpsert({
        state: cataloged,
        requestedProfileId: ensure.id,
        ensure,
      }) ?? findProfileForGatewayUrl(cataloged.profiles, discovery.gatewayUrl);
    if (matched) {
      await selectGatewayProfileRef.current?.(matched.id, { ensureProfile: matched });
      return;
    }
    haptics.success();
  }, []);

  useEffect(() => {
    probeTailscaleComputersRef.current = probeTailscaleComputers;
  }, [probeTailscaleComputers]);

  useEffect(() => {
    runConnectionSelfHealRef.current = runConnectionSelfHeal;
  }, [runConnectionSelfHeal]);

  useEffect(() => {
    maybeHandoffTailscaleToUsbRef.current = maybeHandoffTailscaleToUsb;
  }, [maybeHandoffTailscaleToUsb]);

  useEffect(() => {
    maybeHandoffUsbToRemoteRef.current = maybeHandoffUsbToRemote;
  }, [maybeHandoffUsbToRemote]);

  // Do NOT depend on health.checkedAt — health polls every 30s and would flip the
  // Choose computer modal into "searching" on every tick (picker jitter).
  useEffect(() => {
    if (!isLoaded || settings.demoMode) {
      return;
    }
    void probeTailscaleComputers({ showUi: false, force: false });
  }, [isLoaded, settings.demoMode, profileState.profiles.length, wifiConnected, probeTailscaleComputers]);

  // Bidirectional transport handoff while Connected: plug → USB, unplug → Tailscale/LAN.
  // Do NOT depend on health.checkedAt — handoff itself writes health and would retrigger.
  useEffect(() => {
    if (Platform.OS === 'web' || !isLoaded || settings.demoMode) {
      return;
    }
    void runBidirectionalUsbHandoff();
    const timer = setInterval(() => {
      void runBidirectionalUsbHandoff();
    }, CONNECTION_SELF_HEAL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isLoaded, settings.demoMode, wifiConnected, runBidirectionalUsbHandoff]);

  useEffect(() => {
    if (Platform.OS === 'web' || !isLoaded || settings.demoMode) {
      return;
    }
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState !== 'active') {
        return;
      }
      // Plug/unplug while backgrounded: flip transport without clearing chat.
      void runBidirectionalUsbHandoff();
      if (
        !shouldRunForegroundUsbHeal({
          platform: Platform.OS,
          demoMode: settingsRef.current.demoMode,
          healthOk: isGatewayHealthOk(healthRef.current),
        })
      ) {
        return;
      }
      connectionHealAttemptRef.current = 0;
      setConnectionHealAttempt(0);
      void runConnectionSelfHealRef.current();
      void probeTailscaleComputersRef.current({ showUi: false, force: false });
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [isLoaded, settings.demoMode]);

  const bootstrapGateway = useCallback(async (): Promise<boolean> => {
    if (settingsRef.current.demoMode) {
      setGatewayBootstrapPhase('connected');
      setBootstrapReady(true);
      setConnectionState('demo');
      return true;
    }

    setConnectionState('connecting');

    if (settingsRef.current.connectionMode === 'relay') {
      const hasRelayToken = Boolean(mobileTokenRef.current);
      setGatewayBootstrapPhase(hasRelayToken ? 'connected' : 'needs_setup');
      setConnectionState(hasRelayToken ? 'connected' : 'disconnected');
      await refreshHealth();
      setBootstrapReady(true);
      return hasRelayToken;
    }

    setGatewayBootstrapPhase('searching');
    let url = await autoDiscoverGateway();
    effectiveGatewayUrlRef.current = url;
    setEffectiveGatewayUrl(url);
    await refreshHealth();
    await probeTailscaleComputers({ showUi: false, force: true });

    // Brand-new install: do not silent Find-computers + auto-select a Mac.
    // That path persisted Tailscale/USB discoveries and showed Outdated connection
    // before the stranger ever paired (Play reinstall with Tailscale on).
    if (
      !isGatewayHealthOk(healthRef.current) &&
      shouldAutoScanOnBootstrap(profileStateRef.current.profiles)
    ) {
      const profiles = await scanForGatewayProfiles();
      const active = activeProfile(profileStateRef.current);
      if (active) {
        await selectGatewayProfile(active.id);
      } else if (profiles.length > 0) {
        await selectGatewayProfile(profiles[0].id);
      }
      url = await autoDiscoverGateway();
      effectiveGatewayUrlRef.current = url;
      setEffectiveGatewayUrl(url);
      await refreshHealth();
      await probeTailscaleComputers({ showUi: false, force: true });
    }

    const reachable = checkGatewayReachable({
      demoMode: settingsRef.current.demoMode,
      health: healthRef.current,
      gatewayUrl: effectiveGatewayUrlRef.current,
    });
    setGatewayBootstrapPhase(reachable ? 'connected' : 'needs_setup');
    setBootstrapReady(true);
    if (!reachable) {
      setConnectionState('disconnected');
    } else if (isGatewayHealthOk(healthRef.current)) {
      setConnectionState('connected');
    }
    return reachable;
  }, [
    autoDiscoverGateway,
    refreshHealth,
    scanForGatewayProfiles,
    selectGatewayProfile,
    probeTailscaleComputers,
  ]);

  const retryGatewayBootstrap = useCallback(async () => {
    return bootstrapGateway();
  }, [bootstrapGateway]);

  useEffect(() => {
    if (!isLoaded || initialBootstrapRef.current) {
      return;
    }
    initialBootstrapRef.current = true;
    bootstrapGateway();
  }, [isLoaded, bootstrapGateway]);

  const applySetupDeepLink = useCallback(
    async (params: SetupDeepLinkParams) => {
      if (params.demoMode) {
        if (!isDemoModeAllowed()) {
          return;
        }
        // If the user already has profiles configured or has a set gatewayUrl, do not force demoMode on them
        if (settingsRef.current.gatewayUrl || profileStateRef.current.profiles.length > 0) {
          console.log('[useHermesDeepLinks] Ignoring demo setup link because gateway/profiles are already configured.');
          return;
        }
        const nextSettings: GatewaySettings = {
          ...settingsRef.current,
          demoMode: true,
          connectionMode: 'gateway',
          glanceMode: false,
          ...(isDeveloperLeashUnlockAllowed()
            ? { developerLeashUnlock: true, thumbgateProActive: true }
            : {}),
        };
        await saveSettings(nextSettings, apiKeyRef.current);
        await bootstrapGateway();
        return;
      }

      const relayCode = params.relayCode?.trim().toUpperCase();
      let relayPairSucceeded = false;
      if (relayCode) {
        try {
          const token = await completePairing(settingsRef.current.cloudUrl, relayCode);
          await secureCredentials.saveMobileToken(token);
          setMobileToken(token);
          mobileTokenRef.current = token;
          setLastEventError(undefined);
          connectEventsRef.current?.();
          relayPairSucceeded = true;
        } catch (error) {
          setLastEventError(
            error instanceof Error ? error.message : 'Hermes Relay pairing failed',
          );
        }
      }

      const upsertExtraComputers = async (): Promise<void> => {
        if (!params.extraComputers?.length) {
          return;
        }
        let nextProfileState = profileStateRef.current;
        for (const extra of params.extraComputers) {
          const extraUrl = extra.gatewayUrl?.trim();
          if (!extraUrl || !isValidGatewayUrl(extraUrl)) {
            continue;
          }
          const extraName = extra.macName?.trim();
          nextProfileState = upsertDiscoveredProfile(
            nextProfileState,
            {
              gatewayUrl: extraUrl,
              localIp: extractLanIpFromGatewayUrl(extraUrl) ?? undefined,
              hostname: extraName,
              label: extraName,
            },
            false,
          );
        }
        if (nextProfileState !== profileStateRef.current) {
          nextProfileState = sanitizeGatewayProfileState(nextProfileState);
          profileStateRef.current = nextProfileState;
          setProfileState(nextProfileState);
          await gatewayProfiles.save(nextProfileState);
        }
        await syncExtraProfileApiKeys(params.extraComputers);
      };

      if (params.tailnetProbeHosts?.length) {
        const merged = await tailnetProbeStorage.merge(params.tailnetProbeHosts);
        tailnetProbeHostsRef.current = merged;
        setTailnetProbeHostCount(merged.length);
        void probeTailscaleComputersRef.current({ showUi: false, force: true });
      }

      const persistDecision = evaluatePairDeepLinkApply({
        params,
        relayPairAttempted: Boolean(relayCode),
        relayPairSucceeded,
      });
      if (persistDecision.userError) {
        setLastEventError(persistDecision.userError);
      }
      if (!persistDecision.shouldPersistProfiles && !persistDecision.shouldPersistSettings) {
        if (relayPairSucceeded) {
          haptics.success();
          await refreshHealth();
        }
        return;
      }

      if (!params.gatewayUrl?.trim()) {
        await upsertExtraComputers();
        void probeTailscaleComputersRef.current({ showUi: false, force: true });
        if (relayPairSucceeded) {
          haptics.success();
          await refreshHealth();
        }
        return;
      }

      const gatewayUrl = params.gatewayUrl.trim();
      if (!isValidGatewayUrl(gatewayUrl)) {
        setLastEventError('Pair link had an incomplete computer URL — try pairing again from your computer.');
        return;
      }
      const lanIp = extractLanIpFromGatewayUrl(gatewayUrl);
      const macName = params.macName?.trim();

      if (!relayCode && lanIp && !mobileTokenRef.current) {
        const fromPairServer = await resolvePairServerRelayCode(lanIp).catch(() => null);
        if (fromPairServer) {
          try {
            const token = await completePairing(settingsRef.current.cloudUrl, fromPairServer);
            await secureCredentials.saveMobileToken(token);
            setMobileToken(token);
            mobileTokenRef.current = token;
            setLastEventError(undefined);
            connectEventsRef.current?.();
          } catch (error) {
            console.warn(
              '[hermes-mobile] Relay auto-pair from pair server failed:',
              error instanceof Error ? error.message : error,
            );
          }
        }
      }

      let nextProfileState = upsertDiscoveredProfile(
        profileStateRef.current,
        {
          gatewayUrl,
          localIp: lanIp ?? undefined,
          hostname: macName,
          label: macName,
        },
        true,
      );
      for (const extra of params.extraComputers ?? []) {
        const extraUrl = extra.gatewayUrl?.trim();
        if (!extraUrl || !isValidGatewayUrl(extraUrl)) {
          continue;
        }
        const extraName = extra.macName?.trim();
        nextProfileState = upsertDiscoveredProfile(
          nextProfileState,
          {
            gatewayUrl: extraUrl,
            localIp: extractLanIpFromGatewayUrl(extraUrl) ?? undefined,
            hostname: extraName,
            label: extraName,
          },
          false,
        );
      }
      if (macName) {
        const displayName = macName.replace(/\.local$/i, '').trim();
        const hostname = macName.includes('.local') ? macName : `${displayName}.local`;
        nextProfileState = upsertDiscoveredProfile(
          nextProfileState,
          {
            gatewayUrl: USB_LOOPBACK_GATEWAY_URL,
            hostname,
            label: displayName,
            localIp: '127.0.0.1',
          },
          isLoopbackGatewayUrl(gatewayUrl),
        );
      }
      nextProfileState = sanitizeGatewayProfileState(nextProfileState);
      if (persistDecision.shouldPersistProfiles) {
        profileStateRef.current = nextProfileState;
        setProfileState(nextProfileState);
        await gatewayProfiles.save(nextProfileState);
      }

      if (params.apiKey?.trim() && nextProfileState.activeProfileId) {
        await secureCredentials.saveProfileApiKey(
          nextProfileState.activeProfileId,
          params.apiKey.trim(),
        );
      }
      await syncExtraProfileApiKeys(params.extraComputers);

      if (!persistDecision.shouldPersistSettings) {
        await refreshHealth();
        return;
      }

      const nextSettings: GatewaySettings = {
        ...settingsRef.current,
        gatewayUrl,
        connectionMode: persistDecision.connectionMode,
        demoMode: false,
      };
      const nextKey = params.apiKey?.trim() || apiKeyRef.current;
      await saveSettings(nextSettings, nextKey);
      haptics.success();
      await refreshHealth();
      void probeTailscaleComputersRef.current({ showUi: false, force: true });
    },
    [refreshHealth, saveSettings, bootstrapGateway],
  );

  const completePair = useCallback(
    async (code: string) => {
      const token = await completePairing(settings.cloudUrl, code);
      await secureCredentials.saveMobileToken(token);
      setMobileToken(token);
      mobileTokenRef.current = token;
      setLastEventError(undefined);
      haptics.success();
      await refreshHealth();
      connectEvents();
    },
    [connectEvents, refreshHealth, settings.cloudUrl],
  );

  const disconnectPair = useCallback(async () => {
    await secureCredentials.clearMobileToken();
    setMobileToken('');
    mobileTokenRef.current = '';
    setPendingApprovals([]);
    stopRelayPolling();
    setConnectionState('disconnected');
    await refreshHealth();
  }, [refreshHealth, stopRelayPolling]);

  const triggerTestIntercept = useCallback(async () => {
    const token = mobileTokenRef.current;
    if (!token) {
      throw new Error('Pair with your computer in Settings before requesting a test intercept.');
    }
    await requestTestIntercept(settings.cloudUrl, token);
    await pollRelayQueue();
  }, [pollRelayQueue, settings.cloudUrl]);

  const [storeLeashPreviewActive, setStoreLeashPreviewActive] = useState(false);

  const activateStoreLeashPreview = useCallback(() => {
    setStoreLeashPreviewActive(true);
    setPostHogDogfoodExclusions({ storeLeashPreview: true });
  }, []);

  const injectSmokeApproval = useCallback(() => {
    const event = buildDemoGateBlockedEvent();
    const pending = gateBlockedToPending(event);
    if (pending) {
      haptics.warning();
      setPendingApprovals((prev) => {
        if (prev.some((item) => item.actionId === pending.actionId)) {
          return prev;
        }
        return dedupeAndCapPendingApprovals([pending, ...prev]);
      });
    }
  }, []);

  const injectDemoApproval = useCallback(() => {
    injectSmokeApproval();
    setConnectionState('demo');
  }, [injectSmokeApproval]);

  const enqueueTextApproval = useCallback((approval: PendingApproval): boolean => {
    if (approval.source !== 'text_nudge') {
      return false;
    }
    const key = approval.runId ?? approval.actionId;
    if (!key || resolvedTextApprovalIdsRef.current.has(key)) {
      return false;
    }
    let queued = false;
    setPendingApprovals((prev) => {
      if (prev.some((item) => (item.runId ?? item.actionId) === key)) {
        return prev;
      }
      queued = true;
      haptics.warning();
      return dedupeAndCapPendingApprovals([approval, ...prev]);
    });
    return queued;
  }, []);

  const captureLeashThumbgate = useCallback(
    async (approval: PendingApproval, decision: 'approve' | 'reject') => {
      const currentSettings = settingsRef.current;
      const shouldCaptureDown = decision === 'reject' && currentSettings.thumbgateCaptureOnDown;
      const shouldCaptureUp = decision === 'approve' && currentSettings.thumbgateCaptureOnUp;
      if (!shouldCaptureDown && !shouldCaptureUp) {
        return;
      }
      const body = buildLeashThumbgateCaptureBody(
        approval,
        decision === 'approve' ? 'up' : 'down',
      );
      await captureThumbgateFeedback(currentSettings.thumbgateApiUrl, body, thumbgateApiKeyRef.current);
    },
    [],
  );

  const submitChatOutputFeedback = useCallback(
    async (
      message: HermesMessage,
      signal: ThumbgateCaptureSignal,
      options: { session?: HermesSession | null; explanation?: string } = {},
    ): Promise<boolean> => {
      const currentSettings = settingsRef.current;
      if (!isThumbgateLeashUnlocked(currentSettings)) {
        return false;
      }
      const shouldCaptureDown = signal === 'down' && currentSettings.thumbgateCaptureOnDown;
      const shouldCaptureUp = signal === 'up' && currentSettings.thumbgateCaptureOnUp;
      if (!shouldCaptureDown && !shouldCaptureUp) {
        return false;
      }

      const busyKey =
        message.id?.trim() ||
        message.created_at?.trim() ||
        `${message.role}-${message.content.slice(0, 48)}`;
      setChatOutputFeedbackBusyId(busyKey);
      try {
        const body = buildChatOutputThumbgateCaptureBody(message, signal, {
          session: options.session,
          explanation: options.explanation,
        });
        await captureThumbgateFeedback(
          currentSettings.thumbgateApiUrl,
          body,
          thumbgateApiKeyRef.current,
        );
        haptics.success();
        return true;
      } catch (error) {
        setLastEventError(
          error instanceof Error ? error.message : 'ThumbGate capture failed',
        );
        haptics.warning();
        return false;
      } finally {
        setChatOutputFeedbackBusyId(null);
      }
    },
    [],
  );

  const sendGateAction = useCallback((rawMessage: string) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(rawMessage);
    }
  }, []);

  const submitApprovalChoice = useCallback(
    async (
      actionId: string,
      choice: ApprovalChoice,
      approval?: PendingApproval,
    ) => {
      const pending =
        approval ??
        pendingApprovals.find(
          (item) => item.actionId === actionId || item.runId === actionId,
        );
      if (!pending) {
        throw new Error('Approval no longer pending');
      }

      const currentSettings = settingsRef.current;
      const request = fromPendingApproval(pending, currentSettings.approvalPolicy);

      if (currentSettings.demoMode || pending.actionId.startsWith('demo_')) {
        setPendingApprovals((prev) =>
          prev.filter(
            (item) =>
              item.actionId !== actionId &&
              item.runId !== actionId &&
              item.actionId !== pending.actionId,
          ),
        );
        if (choice === 'deny' || choice === 'once') {
          captureLeashThumbgate(pending, choice === 'deny' ? 'reject' : 'approve').catch(() => {});
        }
        void dismissSingleApprovalNotification(pending.actionId);
        return;
      }

      if (request.source === 'text_nudge') {
        resolvedTextApprovalIdsRef.current.add(pending.actionId);
        if (pending.runId) {
          resolvedTextApprovalIdsRef.current.add(pending.runId);
        }
        if (request.sessionKey) {
          await resolveApprovalChoice(request, choice, {
            gatewayUrl: effectiveGatewayUrlRef.current,
            apiKey: apiKeyRef.current,
            sendGateAction,
            leashSettings: currentSettings,
          });
        } else {
          const relayText =
            choice === 'deny'
              ? 'DENY — operator rejected this action; do not execute.'
              : request.approveText;
          if (relayText) {
            setPendingChatRelayText(relayText);
          }
        }
        setPendingApprovals((prev) =>
          prev.filter(
            (item) =>
              item.actionId !== actionId &&
              item.runId !== actionId &&
              item.actionId !== pending.actionId,
          ),
        );
        void dismissSingleApprovalNotification(pending.actionId);
        if (choice === 'once' || choice === 'always') {
          void storage.incrementApprovalsCount().then(() => requestStoreReviewIfThresholdReached());
        }
        return;
      }

      if (currentSettings.connectionMode === 'relay' && mobileTokenRef.current) {
        setPendingApprovals((prev) =>
          prev.filter(
            (item) =>
              item.actionId !== actionId &&
              item.runId !== actionId &&
              item.actionId !== pending.actionId,
          ),
        );
        const verdict = choice === 'deny' ? 'block' : 'allow';
        const reason = choice === 'deny' ? 'Rejected from Hermes Mobile' : undefined;
        await submitVerdict(
          currentSettings.cloudUrl,
          mobileTokenRef.current,
          pending.actionId,
          verdict,
          reason,
        );
        if (choice === 'deny' || choice === 'once') {
          captureLeashThumbgate(pending, choice === 'deny' ? 'reject' : 'approve').catch(
            (error) => {
              setLastEventError(
                error instanceof Error ? error.message : 'ThumbGate capture failed',
              );
            },
          );
        }
        void dismissSingleApprovalNotification(pending.actionId);
        if (choice === 'once' || choice === 'always') {
          void storage.incrementApprovalsCount().then(() => requestStoreReviewIfThresholdReached());
        }
        return;
      }

      await resolveApprovalChoice(request, choice, {
        gatewayUrl: effectiveGatewayUrlRef.current,
        apiKey: apiKeyRef.current,
        sendGateAction: sendGateAction,
        sendChatText: undefined,
        leashSettings: currentSettings,
      });

      setPendingApprovals((prev) =>
        prev.filter(
          (item) =>
            item.actionId !== actionId &&
            item.runId !== actionId &&
            item.actionId !== pending.actionId,
        ),
      );

      if (choice === 'deny' || choice === 'once') {
        captureLeashThumbgate(pending, choice === 'deny' ? 'reject' : 'approve').catch(
          (error) => {
            setLastEventError(
              error instanceof Error ? error.message : 'ThumbGate capture failed',
            );
          },
        );
      }

      void dismissSingleApprovalNotification(pending.actionId);
      if (choice === 'once' || choice === 'always') {
        void storage.incrementApprovalsCount().then(() => requestStoreReviewIfThresholdReached());
      }
    },
    [captureLeashThumbgate, pendingApprovals, sendGateAction],
  );

  const resolveApproval = useCallback(
    (actionId: string, decision: 'approve' | 'reject', approval?: PendingApproval) => {
      const choice: ApprovalChoice = decision === 'approve' ? 'once' : 'deny';
      submitApprovalChoice(actionId, choice, approval).catch((error) => {
        setLastEventError(
          error instanceof Error ? error.message : 'Failed to resolve approval',
        );
      });
    },
    [submitApprovalChoice],
  );

  resolveApprovalRef.current = resolveApproval;
  submitApprovalChoiceRef.current = submitApprovalChoice;

  const setApprovalEditSeed = useCallback((text: string) => {
    setPendingApprovalEditSeed(text);
  }, []);

  const clearApprovalEditSeed = useCallback(() => {
    setPendingApprovalEditSeed(null);
  }, []);

  const clearChatRelayText = useCallback(() => {
    setPendingChatRelayText(null);
  }, []);

  const focusChatSession = useCallback((sessionId: string) => {
    const trimmed = sessionId.trim();
    if (trimmed) {
      setNotificationFocusSessionId(trimmed);
    }
  }, []);

  const clearNotificationFocusSession = useCallback(() => {
    setNotificationFocusSessionId(null);
  }, []);

  const runAgentTool = useCallback(
    async (name: HermesAgentToolName) =>
      runHermesAgentTool(name, {
        pendingApprovals,
        health,
        resolveApproval,
      }),
    [health, pendingApprovals, resolveApproval],
  );

  const presentation = useMemo(() => resolvePresentationState(settings), [settings]);

  useEffect(() => {
    if (connectionState === 'disconnected') {
      signOfLifeSentRef.current = false;
      return;
    }
    const greeting = buildSessionGreeting({
      pendingCount: pendingApprovals.length,
      healthLevel: health?.level,
      connectionState,
      glanceMode: settings.glanceMode,
    });
    setSessionGreeting(greeting);
    if (!signOfLifeSentRef.current) {
      signOfLifeSentRef.current = true;
      if (presentation.preferAudioFeedback || settings.notificationsEnabled) {
        emitSignOfLife(greeting, { haptic: true });
      }
    }
  }, [
    connectionState,
    health?.level,
    presentation.preferAudioFeedback,
    settings.glanceMode,
    settings.notificationsEnabled,
  ]);

  const activeGatewayProfile = useMemo(() => activeProfile(profileState), [profileState]);

  const effectiveConnectionState = useMemo<GatewayContextValue['connectionState']>(() => {
    if (
      settings.connectionMode === 'relay' &&
      mobileToken &&
      !lastEventError &&
      connectionState === 'disconnected'
    ) {
      return 'connected';
    }
    return connectionState;
  }, [connectionState, lastEventError, mobileToken, settings.connectionMode]);

  const gatewayReachable = useMemo(() => {
    if (settings.demoMode) {
      return true;
    }
    if (effectiveConnectionState === 'disconnected') {
      return false;
    }
    return checkGatewayReachable({
      demoMode: false,
      health,
      gatewayUrl: effectiveGatewayUrl,
    });
  }, [settings.demoMode, effectiveConnectionState, health, effectiveGatewayUrl]);

  const connectionHealExhausted = connectionHealAttempt >= CONNECTION_HEAL_EXHAUSTED_AFTER;

  const value = useMemo<GatewayContextValue>(
    () => ({
      settings,
      apiKey,
      thumbgateApiKey,
      mobileToken,
      isPaired: Boolean(mobileToken),
      isLoaded,
      bootstrapReady,
      gatewayBootstrapPhase,
      isGatewayReachable: gatewayReachable,
      health,
      connectionState: effectiveConnectionState,
      pendingApprovals,
      recentReclaims,
      lastEventError,
      presentation,
      sessionGreeting,
      effectiveGatewayUrl,
      transcriptSyncNonce,
      relayWorkers,
      activeRelayWorkerId,
      gatewayProfiles: profileState.profiles,
      activeGatewayProfile,
      profileScanning,
      profileScanProgress,
      profileScanResult,
      refreshHealth,
      wifiConnected,
      autoConnectGateway,
      retryGatewayBootstrap,
      applySetupDeepLink,
      selectGatewayProfile,
      removeGatewayProfile,
      scanForGatewayProfiles,
      tailscaleDiscoveries,
      tailscaleDiscoveryProbing,
      tailscaleVpnActive,
      tailnetProbeHostCount,
      probeTailscaleComputers,
      addDiscoveredTailscaleComputer,
      connectionHealAttempt,
      connectionHealInFlight,
      connectionHealExhausted,
      saveSettings,
      patchSettings,
      activateDeveloperLeashUnlock,
      addGatewayProfile,
      connectEvents,
      disconnectEvents,
      completePair,
      disconnectPair,
      requestTestIntercept: triggerTestIntercept,
      injectDemoApproval,
      injectSmokeApproval,
      activateStoreLeashPreview,
      storeLeashPreviewActive,
      enqueueTextApproval,
      resolveApproval,
      submitApprovalChoice,
      sendGateAction,
      runAgentTool,
      pendingApprovalEditSeed,
      setApprovalEditSeed,
      clearApprovalEditSeed,
      pendingChatRelayText,
      clearChatRelayText,
      notificationFocusSessionId,
      focusChatSession,
      clearNotificationFocusSession,
      runProgress,
      setRunProgress,
      setChatStreamProgressActive,
      addGatewayListener,
      removeGatewayListener,
      chatOutputFeedbackBusyId,
      submitChatOutputFeedback,
    }),
    [
      settings,
      apiKey,
      thumbgateApiKey,
      mobileToken,
      isLoaded,
      bootstrapReady,
      gatewayBootstrapPhase,
      gatewayReachable,
      health,
      effectiveConnectionState,
      pendingApprovals,
      recentReclaims,
      lastEventError,
      presentation,
      sessionGreeting,
      effectiveGatewayUrl,
      transcriptSyncNonce,
      relayWorkers,
      activeRelayWorkerId,
      profileState,
      activeGatewayProfile,
      profileScanning,
      profileScanProgress,
      profileScanResult,
      refreshHealth,
      wifiConnected,
      autoConnectGateway,
      retryGatewayBootstrap,
      applySetupDeepLink,
      selectGatewayProfile,
      removeGatewayProfile,
      scanForGatewayProfiles,
      tailscaleDiscoveries,
      tailscaleDiscoveryProbing,
      tailscaleVpnActive,
      tailnetProbeHostCount,
      probeTailscaleComputers,
      addDiscoveredTailscaleComputer,
      connectionHealAttempt,
      connectionHealInFlight,
      connectionHealExhausted,
      saveSettings,
      patchSettings,
      activateDeveloperLeashUnlock,
      addGatewayProfile,
      connectEvents,
      disconnectEvents,
      completePair,
      disconnectPair,
      triggerTestIntercept,
      injectDemoApproval,
      injectSmokeApproval,
      activateStoreLeashPreview,
      storeLeashPreviewActive,
      enqueueTextApproval,
      resolveApproval,
      submitApprovalChoice,
      sendGateAction,
      runAgentTool,
      pendingApprovalEditSeed,
      setApprovalEditSeed,
      clearApprovalEditSeed,
      pendingChatRelayText,
      clearChatRelayText,
      notificationFocusSessionId,
      focusChatSession,
      clearNotificationFocusSession,
      runProgress,
      setRunProgress,
      setChatStreamProgressActive,
      addGatewayListener,
      removeGatewayListener,
      chatOutputFeedbackBusyId,
      submitChatOutputFeedback,
    ],
  );

  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}

export function useGateway(): GatewayContextValue {
  const ctx = useContext(GatewayContext);
  if (!ctx) {
    throw new Error('useGateway must be used within GatewayProvider');
  }
  return ctx;
}
