import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Linking, Platform } from 'react-native';
import type {
  GatewayEventMessage,
  GatewayHealthSnapshot,
  GatewaySettings,
  PendingApproval,
  ReclaimFiredPayload,
} from '../types/gateway';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import type { RunProgressState } from '../types/chatDisplay';
import { applyStreamEvent } from '../utils/chatStreamEvents';
import type { ChatStreamEvent } from '../types/gatewayApi';
import type { GatewayProfile, GatewayProfileState } from '../types/gatewayProfile';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import { EMPTY_GATEWAY_PROFILE_STATE } from '../types/gatewayProfile';
import { storage } from '../services/storage';
import { secureCredentials } from '../services/secureCredentials';
import {
  MobileRelayApiError,
  enqueuedEventToPendingApproval,
  fetchMobileRelayHealth,
  fetchQueue,
  requestTestIntercept,
  submitVerdict,
  completePairing,
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
  setProductAnalyticsOptOut,
  trackProductEvent,
} from '../services/productAnalytics';
import { buildLeashThumbgateCaptureBody } from '../utils/leashThumbgate';
import {
  buildSessionGreeting,
  resolvePresentationState,
  type PresentationState,
} from '../utils/presentationMode';
import {
  isDemoModeAllowed,
  sanitizeDemoModeForRelease,
} from '../utils/demoModePolicy';
import {
  buildGatewayUrlFromLanIp,
  extractLanIpFromGatewayUrl,
  isLoopbackGatewayUrl,
} from '../utils/gatewayUrlPolicy';
import type { SetupDeepLinkParams } from '../utils/setupDeepLink';
import {
  type GatewayBootstrapPhase,
  isGatewayHealthOk,
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
  dedupeGatewayProfiles,
} from '../services/gatewayProfiles';
import {
  discoverAllGatewaysOnLan,
  discoverGatewayOnPhoneSubnet,
  discoverGatewayViaPairServer,
} from '../services/gatewayDiscovery';
import { isGatewaySmokeTestMessage } from '../utils/gatewaySmokeMessages';
import { isThumbgateLeashUnlocked } from '../utils/thumbgateLeash';
import {
  initializeThumbgateIapListeners,
  syncThumbgateLeashEntitlement,
} from '../services/thumbgateIap';
import type { ApprovalChoice } from '../types/approval';
import { resolveApprovalChoice } from '../services/approvalResolver';
import { fromPendingApproval } from '../utils/approvalNormalize';
import { shouldScheduleApprovalNotification } from '../utils/smartNotificationPolicy';
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

interface GatewayContextValue {
  settings: GatewaySettings;
  apiKey: string;
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
  gatewayProfiles: GatewayProfile[];
  activeGatewayProfile: GatewayProfile | null;
  profileScanning: boolean;
  profileScanProgress: LanScanProgress | null;
  profileScanResult: LanScanResult | null;
  refreshHealth: () => Promise<void>;
  autoConnectGateway: () => Promise<string>;
  retryGatewayBootstrap: () => Promise<boolean>;
  applySetupDeepLink: (params: SetupDeepLinkParams) => Promise<void>;
  selectGatewayProfile: (profileId: string) => Promise<void>;
  removeGatewayProfile: (profileId: string) => Promise<void>;
  scanForGatewayProfiles: () => Promise<GatewayProfile[]>;
  saveSettings: (
    settings: GatewaySettings,
    apiKey: string,
    thumbgateApiKey?: string,
  ) => Promise<void>;
  connectEvents: () => void;
  disconnectEvents: () => void;
  completePair: (code: string) => Promise<void>;
  disconnectPair: () => Promise<void>;
  requestTestIntercept: () => Promise<void>;
  injectDemoApproval: () => void;
  injectSmokeApproval: () => void;
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
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<GatewaySettings>(DEFAULT_GATEWAY_SETTINGS);
  const [apiKey, setApiKey] = useState('sk-hermes-api-server-key-2026-06-15');
  const [mobileToken, setMobileToken] = useState('');
  const [runProgress, setRunProgress] = useState<RunProgressState | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [health, setHealth] = useState<GatewayHealthSnapshot | null>(null);
  const [connectionState, setConnectionState] =
    useState<GatewayContextValue['connectionState']>('disconnected');
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [recentReclaims, setRecentReclaims] = useState<ReclaimFiredPayload[]>([]);
  const [lastEventError, setLastEventError] = useState<string | undefined>();
  const [transcriptSyncNonce, setTranscriptSyncNonce] = useState(0);
  const [sessionGreeting, setSessionGreeting] = useState<string | undefined>();
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [gatewayBootstrapPhase, setGatewayBootstrapPhase] =
    useState<GatewayBootstrapPhase>('booting');
  const [profileState, setProfileState] = useState<GatewayProfileState>(EMPTY_GATEWAY_PROFILE_STATE);
  const [profileScanning, setProfileScanning] = useState(false);
  const [profileScanProgress, setProfileScanProgress] = useState<LanScanProgress | null>(null);
  const [profileScanResult, setProfileScanResult] = useState<LanScanResult | null>(null);
  const [effectiveGatewayUrl, setEffectiveGatewayUrl] = useState(
    DEFAULT_GATEWAY_SETTINGS.gatewayUrl,
  );
  const [pendingApprovalEditSeed, setPendingApprovalEditSeed] = useState<string | null>(null);
  const [pendingChatRelayText, setPendingChatRelayText] = useState<string | null>(null);
  const [notificationFocusSessionId, setNotificationFocusSessionId] = useState<string | null>(
    null,
  );
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
  const runProgressRef = useRef<RunProgressState | null>(null);
  const chatStreamProgressActiveRef = useRef(false);
  const setChatStreamProgressActive = useCallback((active: boolean) => {
    chatStreamProgressActiveRef.current = active;
  }, []);
  const listenersRef = useRef<Set<(event: GatewayEventMessage) => void>>(new Set());

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
    if (!settings.notificationsEnabled || Platform.OS === 'web') {
      syncHermesNotificationBadge(0).catch(() => {});
      return;
    }
    syncHermesNotificationBadge(pendingApprovals.length).catch(() => {});
    syncSmartApprovalNotifications(pendingApprovals, {
      badgeCount: pendingApprovals.length,
    }).catch(() => {});
  }, [pendingApprovals, settings.notificationsEnabled]);

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
    mobileTokenRef.current = mobileToken;
  }, [mobileToken]);

  useEffect(() => {
    settingsRef.current = settings;
    apiKeyRef.current = apiKey;
    effectiveGatewayUrlRef.current = effectiveGatewayUrl;
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
        const savedSettings = await storage.loadGatewaySettings();
        const lastLanIp = await storage.loadLastGatewayLanIp();
        let loadedProfiles = await gatewayProfiles.load();
        loadedProfiles = migrateLegacyGateway(loadedProfiles, savedSettings.gatewayUrl, lastLanIp);
        if (loadedProfiles.profiles.length > 0) {
          await gatewayProfiles.save(loadedProfiles);
        }

        const savedKey = await secureCredentials.loadApiKey();
        const savedThumbgateKey = await secureCredentials.loadThumbgateApiKey();
        const savedMobileToken = await secureCredentials.loadMobileToken();

        const active = activeProfile(loadedProfiles);
        let resolvedKey = savedKey || 'sk-hermes-api-server-key-2026-06-15';
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

        if (!mounted) return;
        profileStateRef.current = loadedProfiles;
        setProfileState(loadedProfiles);
        setSettings(resolvedSettings);
        settingsRef.current = resolvedSettings;
        setProductAnalyticsOptOut(Boolean(resolvedSettings.analyticsOptOut));
        effectiveGatewayUrlRef.current = resolvedSettings.gatewayUrl;
        setEffectiveGatewayUrl(resolvedSettings.gatewayUrl);
        setApiKey(resolvedKey);
        apiKeyRef.current = resolvedKey;
        thumbgateApiKeyRef.current = savedThumbgateKey ?? '';
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

  const refreshHealth = useCallback(async () => {
    const currentSettings = settingsRef.current;
    const token = mobileTokenRef.current;
    const key = apiKeyRef.current;
    const gatewayProbeUrl = effectiveGatewayUrlRef.current || currentSettings.gatewayUrl;

    if (currentSettings.connectionMode === 'relay') {
      try {
        const [relayHealth, macHealth] = await Promise.all([
          fetchMobileRelayHealth(currentSettings.cloudUrl),
          fetchGatewayHealth(gatewayProbeUrl, key).catch(() => null),
        ]);
        setHealth({
          level: relayHealth.ok ? 'green' : 'amber',
          status: relayHealth.ok ? 'ok' : 'degraded',
          gatewayState: token ? 'paired' : 'unpaired',
          checkedAt: new Date().toISOString(),
          hostname: macHealth?.hostname,
          localIp: macHealth?.localIp,
        });
      } catch (error) {
        setHealth({
          level: 'red',
          checkedAt: new Date().toISOString(),
          errorMessage:
            error instanceof Error ? error.message : 'Hermes Mobile cloud relay unreachable',
        });
      }
      return;
    }

    try {
      const snapshot = await fetchGatewayHealth(gatewayProbeUrl, key);
      if (snapshot.localIp?.trim()) {
        await storage.saveLastGatewayLanIp(snapshot.localIp);
      }
      setHealth(snapshot);

      const activeId = profileStateRef.current.activeProfileId;
      if (activeId && (snapshot.hostname || snapshot.localIp)) {
        const touched = touchProfileHealth(profileStateRef.current, activeId, {
          hostname: snapshot.hostname,
          localIp: snapshot.localIp,
        });
        profileStateRef.current = touched;
        setProfileState(touched);
        await gatewayProfiles.save(touched);
      }
    } catch (error) {
      setHealth({
        level: 'red',
        checkedAt: new Date().toISOString(),
        errorMessage:
          error instanceof Error ? error.message : 'Hermes gateway unreachable on your Wi‑Fi',
      });
    }
  }, []);

  const stopRelayPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollRelayQueue = useCallback(async () => {
    const token = mobileTokenRef.current;
    const currentSettings = settingsRef.current;
    if (!token || currentSettings.demoMode || !isThumbgateLeashUnlocked(currentSettings)) {
      return;
    }

    try {
      const queue = await fetchQueue(currentSettings.cloudUrl, token);
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

      setPendingApprovals(nonSmokeTests);
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
        setConnectionState('disconnected');
        setLastEventError('Pairing expired — enter a new code from desktop bridge pairing.');
        stopRelayPolling();
        return;
      }
      setConnectionState('disconnected');
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
      currentSettings.demoMode ||
      !isThumbgateLeashUnlocked(currentSettings)
    ) {
      setConnectionState('disconnected');
      return;
    }
    setConnectionState('connecting');
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
    return () => clearInterval(interval);
  }, [isLoaded, refreshHealth]);

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
        if (settingsRef.current.notificationsEnabled) {
          emitSignOfLife(`Approval needed: ${pending.reason.slice(0, 80)}`, { haptic: false });
          const appState = AppState.currentState;
          if (shouldScheduleApprovalNotification(pending, appState)) {
            scheduleApprovalNotification(pending, {
              badgeCount: pendingApprovalsRef.current.length + 1,
            }).catch(() => {});
          }
        }
      }

      setPendingApprovals((prev) => {
        if (prev.some((item) => (item.runId ?? item.actionId) === key)) {
          return prev;
        }
        return [pending, ...prev];
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
        settingsRef.current.notificationsEnabled &&
        AppState.currentState !== 'active'
      ) {
        scheduleRunCompletedNotification(detail, {
          success: !failed,
          runId: progress?.runId,
          sessionId: progress?.sessionId,
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
      const eventRunId = typeof payload.runId === 'string'
        ? payload.runId
        : typeof payload.run_id === 'string'
          ? payload.run_id
          : undefined;
      const eventSessionId = typeof payload.sessionId === 'string'
        ? payload.sessionId
        : typeof payload.session_id === 'string'
          ? payload.session_id
          : undefined;

      setRunProgress((prev) => {
        const dummyState = { runProgress: prev, toolCalls: [] };
        const nextState = applyStreamEvent(dummyState, streamEvt);
        const nextProgress = nextState.runProgress;
        if (nextProgress) {
          return {
            ...nextProgress,
            runId: eventRunId ?? prev?.runId,
            sessionId: eventSessionId ?? prev?.sessionId,
          };
        }
        return null;
      });
    }
  }, [setRunProgress]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    if (!settings.notificationsEnabled) {
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
      }).catch(() => {});
      scheduleRunStallNotification(runProgress.runId, runProgress.sessionId).catch(() => {});
    } else {
      cancelRunStallNotification().catch(() => {});
    }
  }, [runProgress, settings.notificationsEnabled]);

  useEffect(() => {
    if (!settings.notificationsEnabled || Platform.OS === 'web') {
      return;
    }

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        const progress = runProgressRef.current;
        if (progress) {
          scheduleRunProgressNotification(progress, {
            force: true,
            runId: progress.runId,
            sessionId: progress.sessionId,
          }).catch(() => {});
          scheduleRunStallNotification(progress.runId, progress.sessionId).catch(() => {});
        }
      } else if (nextAppState === 'active') {
        cancelRunStallNotification().catch(() => {});
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [settings.notificationsEnabled]);

  const autoDiscoverGateway = useCallback(async (): Promise<string> => {
    const lastLanIp = await storage.loadLastGatewayLanIp();
    const currentUrl = settingsRef.current.gatewayUrl;

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

    const commitDiscoveredUrl = async (successfulUrl: string): Promise<string> => {
      if (successfulUrl !== currentUrl) {
        const nextSettings = { ...settingsRef.current, gatewayUrl: successfulUrl };
        await storage.saveGatewaySettings(nextSettings);
        setSettings(nextSettings);
        settingsRef.current = nextSettings;
      }
      effectiveGatewayUrlRef.current = successfulUrl;
      setEffectiveGatewayUrl(successfulUrl);
      const lanIp = extractLanIpFromGatewayUrl(successfulUrl);
      if (lanIp) {
        await storage.saveLastGatewayLanIp(lanIp);
      }
      const upserted = upsertDiscoveredProfile(
        profileStateRef.current,
        {
          gatewayUrl: successfulUrl,
          localIp: lanIp ?? undefined,
          hostname: healthRef.current?.hostname,
        },
        !profileStateRef.current.activeProfileId,
      );
      profileStateRef.current = upserted;
      setProfileState(upserted);
      await gatewayProfiles.save(upserted);
      return successfulUrl;
    };

    if (currentUrl && !isLoopbackGatewayUrl(currentUrl)) {
      try {
        return await commitDiscoveredUrl(await probe(currentUrl));
      } catch (_) {
        // fall through
      }
    }

    if (lastLanIp) {
      const lastUrl = buildGatewayUrlFromLanIp(lastLanIp);
      if (lastUrl !== currentUrl) {
        try {
          return await commitDiscoveredUrl(await probe(lastUrl));
        } catch (_) {
          // fall through
        }
      }
    }

    const candidates: string[] = [];
    if (Platform.OS === 'web') {
      candidates.push('http://127.0.0.1:8642');
    } else {
      candidates.push('http://10.0.2.2:8642');
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

    // HTTP chat works without the live socket — don't flash "Linking" when Mac is already reachable.
    if (!httpOk) {
      setConnectionState('connecting');
    }

    try {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnectionState('connected');
        setLastEventError(undefined);
        refreshHealth();
      };

      socket.onmessage = (message) => {
        if (typeof message.data === 'string') {
          handleGatewayMessage(message.data);
        }
      };

      socket.onerror = () => {
        const loopback = isLoopbackGatewayUrl(activeUrl);
        if (!loopback) {
          setLastEventError(
            isGatewayHealthOk(healthRef.current)
              ? undefined
              : 'Live link interrupted — pull down on Leash to retry.',
          );
        } else {
          setLastEventError(
            'Phone cannot reach computer at 127.0.0.1 — scan the computer pairing QR (same Wi‑Fi).',
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
    if (settings.demoMode || connectionState !== 'connecting') {
      return;
    }
    if (isGatewayHealthOk(healthRef.current)) {
      setConnectionState('disconnected');
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

  const autoConnectGateway = useCallback(async () => {
    return autoDiscoverGateway();
  }, [autoDiscoverGateway]);

  const saveSettings = useCallback(
    async (nextSettings: GatewaySettings, nextApiKey: string, nextThumbgateApiKey?: string) => {
      const persistedSettings = sanitizeDemoModeForRelease(nextSettings);
      await storage.saveGatewaySettings(persistedSettings);
      await secureCredentials.saveApiKey(nextApiKey);
      if (nextThumbgateApiKey !== undefined) {
        await secureCredentials.saveThumbgateApiKey(nextThumbgateApiKey);
        thumbgateApiKeyRef.current = nextThumbgateApiKey;
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

      const upserted = upsertDiscoveredProfile(
        profileStateRef.current,
        {
          gatewayUrl: persistedSettings.gatewayUrl,
          localIp: lanIp ?? undefined,
          hostname: healthRef.current?.hostname,
        },
        true,
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

  const selectGatewayProfile = useCallback(
    async (profileId: string) => {
      const profile = profileStateRef.current.profiles.find((p) => p.id === profileId);
      if (!profile) {
        return;
      }
      const nextState = selectProfile(profileStateRef.current, profileId);
      profileStateRef.current = nextState;
      setProfileState(nextState);
      await gatewayProfiles.save(nextState);

      const profileKey = await secureCredentials.resolveApiKeyForProfile(profileId);
      const nextSettings: GatewaySettings = {
        ...settingsRef.current,
        gatewayUrl: profile.gatewayUrl,
        connectionMode: 'gateway',
        demoMode: false,
      };
      await saveSettings(nextSettings, profileKey || apiKeyRef.current);
      haptics.success();
    },
    [saveSettings],
  );

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
      const discovered = await discoverAllGatewaysOnLan(lastLanIp, {
        onProgress: setProfileScanProgress,
      });
      let state = profileStateRef.current;
      for (const item of discovered) {
        state = upsertDiscoveredProfile(state, item, false);
      }
      state = dedupeGatewayProfiles(state);
      profileStateRef.current = state;
      setProfileState(state);
      await gatewayProfiles.save(state);
      setProfileScanResult({
        foundCount: discovered.length,
        completedAtMs: Date.now(),
      });
      void trackProductEvent('mac_scan_complete', { found_count: discovered.length });
      if (discovered.length > 0) {
        haptics.success();
      } else {
        haptics.light();
      }
      return state.profiles;
    } finally {
      setProfileScanning(false);
      setProfileScanProgress(null);
    }
  }, []);

  const bootstrapGateway = useCallback(async (): Promise<boolean> => {
    if (settingsRef.current.demoMode) {
      setGatewayBootstrapPhase('connected');
      setBootstrapReady(true);
      return true;
    }

    setGatewayBootstrapPhase('searching');
    let url = await autoDiscoverGateway();
    effectiveGatewayUrlRef.current = url;
    setEffectiveGatewayUrl(url);
    await refreshHealth();

    if (!isGatewayHealthOk(healthRef.current)) {
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
    }

    const reachable = checkGatewayReachable({
      demoMode: settingsRef.current.demoMode,
      health: healthRef.current,
      gatewayUrl: effectiveGatewayUrlRef.current,
    });
    setGatewayBootstrapPhase(reachable ? 'connected' : 'needs_setup');
    setBootstrapReady(true);
    return reachable;
  }, [
    autoDiscoverGateway,
    refreshHealth,
    scanForGatewayProfiles,
    selectGatewayProfile,
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
        const nextSettings: GatewaySettings = {
          ...settingsRef.current,
          demoMode: true,
          connectionMode: 'gateway',
        };
        await saveSettings(nextSettings, apiKeyRef.current);
        return;
      }

      if (!params.gatewayUrl?.trim()) {
        return;
      }

      const gatewayUrl = params.gatewayUrl.trim();
      const lanIp = extractLanIpFromGatewayUrl(gatewayUrl);
      const macName = params.macName?.trim();
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
      profileStateRef.current = nextProfileState;
      setProfileState(nextProfileState);
      await gatewayProfiles.save(nextProfileState);

      if (params.apiKey?.trim() && nextProfileState.activeProfileId) {
        await secureCredentials.saveProfileApiKey(
          nextProfileState.activeProfileId,
          params.apiKey.trim(),
        );
      }

      const nextSettings: GatewaySettings = {
        ...settingsRef.current,
        gatewayUrl,
        connectionMode: 'gateway',
        demoMode: false,
      };
      const nextKey = params.apiKey?.trim() || apiKeyRef.current;
      await saveSettings(nextSettings, nextKey);
      haptics.success();
    },
    [saveSettings],
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

  const injectSmokeApproval = useCallback(() => {
    const event = buildDemoGateBlockedEvent();
    const pending = gateBlockedToPending(event);
    if (pending) {
      haptics.warning();
      setPendingApprovals((prev) => {
        if (prev.some((item) => item.actionId === pending.actionId)) {
          return prev;
        }
        return [pending, ...prev];
      });
    }
  }, []);

  const injectDemoApproval = useCallback(() => {
    injectSmokeApproval();
    setConnectionState('demo');
  }, [injectSmokeApproval]);

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

      if (request.source === 'text_nudge') {
        if (request.sessionKey) {
          await resolveApprovalChoice(request, choice, {
            gatewayUrl: effectiveGatewayUrlRef.current,
            apiKey: apiKeyRef.current,
            sendGateAction,
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
        await dismissSingleApprovalNotification(pending.actionId);
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
        await dismissSingleApprovalNotification(pending.actionId);
        return;
      }

      await resolveApprovalChoice(request, choice, {
        gatewayUrl: effectiveGatewayUrlRef.current,
        apiKey: apiKeyRef.current,
        sendGateAction: sendGateAction,
        sendChatText: undefined,
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

      await dismissSingleApprovalNotification(pending.actionId);
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
    if (connectionState !== 'connected' && connectionState !== 'demo') {
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

  const gatewayReachable = useMemo(() => {
    if (settings.demoMode) {
      return true;
    }
    if (connectionState === 'disconnected') {
      return false;
    }
    return checkGatewayReachable({
      demoMode: false,
      health,
      gatewayUrl: effectiveGatewayUrl,
    });
  }, [settings.demoMode, connectionState, health, effectiveGatewayUrl]);

  const value = useMemo<GatewayContextValue>(
    () => ({
      settings,
      apiKey,
      mobileToken,
      isPaired: Boolean(mobileToken),
      isLoaded,
      bootstrapReady,
      gatewayBootstrapPhase,
      isGatewayReachable: gatewayReachable,
      health,
      connectionState,
      pendingApprovals,
      recentReclaims,
      lastEventError,
      presentation,
      sessionGreeting,
      effectiveGatewayUrl,
      transcriptSyncNonce,
      gatewayProfiles: profileState.profiles,
      activeGatewayProfile,
      profileScanning,
      profileScanProgress,
      profileScanResult,
      refreshHealth,
      autoConnectGateway,
      retryGatewayBootstrap,
      applySetupDeepLink,
      selectGatewayProfile,
      removeGatewayProfile,
      scanForGatewayProfiles,
      saveSettings,
      connectEvents,
      disconnectEvents,
      completePair,
      disconnectPair,
      requestTestIntercept: triggerTestIntercept,
      injectDemoApproval,
      injectSmokeApproval,
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
    }),
    [
      settings,
      apiKey,
      mobileToken,
      isLoaded,
      bootstrapReady,
      gatewayBootstrapPhase,
      gatewayReachable,
      health,
      connectionState,
      pendingApprovals,
      recentReclaims,
      lastEventError,
      presentation,
      sessionGreeting,
      effectiveGatewayUrl,
      transcriptSyncNonce,
      profileState,
      activeGatewayProfile,
      profileScanning,
      profileScanProgress,
      profileScanResult,
      refreshHealth,
      autoConnectGateway,
      retryGatewayBootstrap,
      applySetupDeepLink,
      selectGatewayProfile,
      removeGatewayProfile,
      scanForGatewayProfiles,
      saveSettings,
      connectEvents,
      disconnectEvents,
      completePair,
      disconnectPair,
      triggerTestIntercept,
      injectDemoApproval,
      injectSmokeApproval,
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
