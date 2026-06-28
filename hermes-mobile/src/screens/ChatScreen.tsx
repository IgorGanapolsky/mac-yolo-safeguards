import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  SectionList,
  AppState,
  Keyboard,
  Alert,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  useGatewayConnection,
  useGatewayRelay,
  useGatewayApprovals,
  useGatewayChatSync,
} from '../hooks/useGatewaySelector';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { composerDockInsets, ANDROID_TAB_BAR_ESTIMATE_PX } from '../utils/composerKeyboard';
import Constants from 'expo-constants';
import { colors } from '../theme/colors';
import { isDemoModeAllowed } from '../utils/demoModePolicy';
import { haptics } from '../services/haptics';
import GatewayProfilePicker from '../components/GatewayProfilePicker';
import {
  listSessions,
  createSession,
  getSession,
  listMessages,
  sendChatMessage,
} from '../services/hermesChatClient';
import { chatSendBlockedMessage, humanizeChatError, isConnectivityMessage, isSessionInUseError } from '../utils/chatErrors';
import { HermesGatewayApiError, deleteSession, forkSession, getCapabilities, stopRun, streamSessionChat } from '../services/hermesGatewayClient';
import { fetchGatewayHealth } from '../services/gatewayClient';
import type { HermesSession, HermesMessage } from '../types/chat';
import type { ChatProject, ChatProjectState } from '../types/chatProject';
import { EMPTY_CHAT_PROJECT_STATE } from '../types/chatProject';
import {
  bindSessionToProject,
  chatProjects,
  clearAllSessionBindings,
  clearBoundSessions,
  pinSessionLabel,
  projectNameForSession,
  setActiveProject,
  setActiveSession,
} from '../services/chatProjects';
import { storage } from '../services/storage';
import { buildMobileChatSystemPrompt } from '../utils/workspacePrompt';
import {
  formatSessionDate,
  formatSessionTitle,
  filterDismissedThreadSessions,
  isAutomatedCronSession,
  isRecentsRailSession,
  sessionDisplayTitle,
  sessionPickerLabel,
  sessionLastActiveValue,
} from '../utils/sessionDisplay';
import { formatMessageTimestamp, prepareMessagesForDisplay } from '../utils/chatMessageDisplay';
import {
  isMessageBodyEmpty,
  isMessageDisplayEmpty,
  mergeServerMessagesWithPending,
  dedupeChatMessages,
  transcriptDigest,
  hasUnsyncedLocalMessages,
  normalizeMessageText,
} from '../utils/chatMessageMerge';
import {
  resolveChatOutputFeedbackBusyKey,
  shouldShowChatOutputFeedback,
} from '../utils/chatOutputFeedback';
import { isThumbgateLeashUnlocked } from '../utils/thumbgateLeash';
import {
  displayableLlmModel,
  humanizeComposerStatus,
  shouldShowComposerProgressBanner,
} from '../utils/runProgressDisplay';
import { isChatNearBottom } from '../utils/chatScrollSync';
import {
  CHAT_LIST_HEADER_CLEARANCE,
  shouldShowSubmittedPromptStrip,
} from '../utils/chatOutboundDisplay';
import {
  hasAssistantReplyInMessages,
  shouldShowRecentChatsPanel,
} from '../utils/chatRecentChatsPanel';
import ChatScreenHeader from '../components/ChatScreenHeader';
import ChatEmptyGreeting from '../components/ChatEmptyGreeting';
import CodexCommandCenter from '../components/CodexCommandCenter';
import RecentChatsList from '../components/RecentChatsList';
import SubmittedPromptStrip from '../components/SubmittedPromptStrip';
import ChatConnectionPanel from '../components/ChatConnectionPanel';
import LoadingButton from '../components/ui/LoadingButton';
import ChatInputBar from '../components/ChatInputBar';
import ChatQuickActions, { type ChatQuickAction } from '../components/ChatQuickActions';
import ChatMessageListItem from '../components/ChatMessageListItem';
import ChatMessageDetailModal from '../components/ChatMessageDetailModal';
import FeedbackPromptModal from '../components/FeedbackPromptModal';
import GatewayOpsSection from '../components/GatewayOpsSection';
import ChatApprovalBar from '../components/ChatApprovalBar';
import RunProgressBanner from '../components/RunProgressBanner';
import type { RunProgressState } from '../types/chatDisplay';
import type { GatewayEventMessage } from '../types/gateway';
import { applyStreamEvent, mergeRunUsageFromPayload, mergeSessionUsageIntoRunProgress, runProgressForDisplayEqual } from '../utils/chatStreamEvents';
import { releaseMacOperatorSlot, retryOnSessionInUse } from '../utils/chatSessionRecovery';
import { resolveChatProject } from '../utils/chatContext';
import {
  formatMacConnectionRetryBanner,
  resolveChatMachineHeaderDisplay,
} from '../utils/chatMachineHeader';
import { resolveRelayRouteDisplay } from '../utils/relayRouting';
import {
  connectionHealSnapshot,
  hasAlternateHealRoutes,
  shouldShowMacConnectionHelp,
  shouldShowMacRetryBanner,
} from '../utils/connectionErrorPolicy';
import { isLoopbackGatewayUrl } from '../utils/gatewayUrlPolicy';
import { isInvalidGatewayProfile } from '../services/gatewayProfiles';
import { isPrivateLanGatewayUrl } from '../utils/gatewayEndpoint';
import { detectUsbHostMismatch } from '../utils/gatewayProfilePicker';
import { USB_LOOPBACK_GATEWAY_URL } from '../utils/gatewayLoopbackFallback';
import { isMacGatewayHttpOk, isGatewayHealthPending } from '../utils/gatewayConnection';
import { isGatewayLiveForDelivery } from '../utils/outboundDeliveryStatus';
import {
  OUTBOUND_PENDING_RECOVERY_MS,
  OUTBOUND_SEND_LOCK_TIMEOUT_MS,
  OUTBOUND_STUCK_FAILURE_REASON,
  applyStuckOutboundRecovery,
  findStuckPendingOutboundIds,
  shouldRecoverOutboundSendLock,
} from '../utils/outboundSendRecovery';
import {
  listAllPendingTextApprovals,
  listInlineTextApprovals,
  nudgeResolutionKey,
  parseApprovalNudgeFromContent,
  type ChatRunApproval,
  type ChatTextApproval,
  type LeashPhraseHint,
} from '../utils/chatApproval';
import {
  fromChatRunApproval,
  fromChatTextApproval,
  fromApprovalRequestEvent,
  fromPendingApproval,
} from '../utils/approvalNormalize';
import { enrichApprovalRequest } from '../utils/approvalProposal';
import type { ApprovalChoice, HermesApprovalRequest } from '../types/approval';
import {
  CHAT_APPROVAL_UNDO_TEXT,
  CHAT_APPROVAL_EDIT_PREFIX,
  resolveApprovalChoice,
} from '../services/approvalResolver';
import {
  buildTelegramInboxSession,
  isTelegramInboxSession,
  fetchTelegramInboxMessages,
  resolveTelegramInboxReplySessionId,
} from '../services/telegramInbox';
import { isTelegramSession, pickPrimaryTelegramSession, pickDefaultSession, buildSessionPickerSections, sessionSourceLabel } from '../utils/sessionSelection';
import {
  extractAssistantFromRunCompletedPayload,
  findNewAssistantReply,
  GENERIC_EMPTY_STREAM_PLACEHOLDER,
  isTelegramDeferredEmptyStream,
  snapshotAssistantBodies,
  TELEGRAM_QUEUED_REPLY_PLACEHOLDER,
} from '../utils/streamAssistantText';
import { extractTerminalActivityFromMessage, isTerminalToolName } from '../utils/terminalActivity';
import {
  buildFallbackPromptActions,
  buildRecentPromptActions,
} from '../utils/recentPromptActions';

function projectSessions(
  allSessions: HermesSession[],
  projectState: ChatProjectState,
  projectId: string,
): HermesSession[] {
  const ids = new Set(
    projectState.projects.find((p) => p.id === projectId)?.sessionIds ?? [],
  );
  return allSessions.filter(
    (session) =>
      ids.has(session.id) ||
      isTelegramSession(session) ||
      isTelegramInboxSession(session),
  );
}

export default function ChatScreen() {
  const {
    settings,
    connectionState,
    apiKey,
    effectiveGatewayUrl,
    health,
    refreshHealth,
    retryGatewayBootstrap,
    activeGatewayProfile,
    gatewayProfiles,
    selectGatewayProfile,
    removeGatewayProfile,
    scanForGatewayProfiles,
    profileScanning,
    profileScanProgress,
    profileScanResult,
    autoConnectGateway,
    connectEvents,
    addGatewayProfile,
    completePair,
    saveSettings,
    wifiConnected,
    tailscaleDiscoveries,
    tailscaleDiscoveryProbing,
    addDiscoveredTailscaleComputer,
    probeTailscaleComputers,
    connectionHealAttempt,
    connectionHealInFlight,
    connectionHealExhausted,
  } = useGatewayConnection();
  const { relayWorkers, isPaired, activeRelayWorkerId } = useGatewayRelay();
  const {
    pendingApprovals,
    submitApprovalChoice,
    sendGateAction,
    pendingApprovalEditSeed,
    clearApprovalEditSeed,
    runProgress,
    setRunProgress,
    setChatStreamProgressActive,
    submitChatOutputFeedback,
    chatOutputFeedbackBusyId,
  } = useGatewayApprovals();
  const {
    transcriptSyncNonce,
    pendingChatRelayText,
    clearChatRelayText,
    notificationFocusSessionId,
    clearNotificationFocusSession,
    addGatewayListener,
    removeGatewayListener,
  } = useGatewayChatSync();
  const navigation = useNavigation();
  const gatewayUrl = effectiveGatewayUrl || settings.gatewayUrl;
  const insets = useSafeAreaInsets();
  
  const [sessions, setSessions] = useState<HermesSession[]>([]);
  const deletedDemoSessionIdsRef = useRef<Set<string>>(new Set());
  const [currentSession, setCurrentSession] = useState<HermesSession | null>(null);
  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sessionModalVisible, setSessionModalVisible] = useState(false);
  const [toolsModalVisible, setToolsModalVisible] = useState(false);
  const [macPickerVisible, setMacPickerVisible] = useState(false);
  const [isScanningMacs, setIsScanningMacs] = useState(false);
  const [projectModalVisible, setProjectModalVisible] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [projectState, setProjectState] = useState<ChatProjectState>(EMPTY_CHAT_PROJECT_STATE);
  const [isProjectsLoaded, setIsProjectsLoaded] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [macRetryBusy, setMacRetryBusy] = useState(false);
  const [pendingRunApproval, setPendingRunApproval] = useState<ChatRunApproval | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const [resolvedApprovalKeys, setResolvedApprovalKeys] = useState<Set<string>>(() => new Set());
  const [telegramReplySessionId, setTelegramReplySessionId] = useState<string>('');
  const [operatorTerminalLine, setOperatorTerminalLine] = useState<{
    toolName?: string;
    text: string;
  } | null>(null);
  const [gatewayModel, setGatewayModel] = useState<string | undefined>();
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [connectionPanelRefreshing, setConnectionPanelRefreshing] = useState(false);
  const [telegramInboxMeta, setTelegramInboxMeta] = useState({ threadCount: 0, messageCap: 250 });
  const skipSessionAutoSelectRef = useRef(false);
  /** Invalidates in-flight dismissed-session hydration after clear-all. */
  const dismissedHydrationGenRef = useRef(0);
  const dismissedSessionIdsRef = useRef<string[]>([]);
  const hideCronSessionsRef = useRef(false);
  const [composerFocusNonce, setComposerFocusNonce] = useState(0);
  const [recentChatsDismissed, setRecentChatsDismissed] = useState(false);
  const [dismissedSessionIds, setDismissedSessionIds] = useState<string[]>([]);
  const [hideCronSessions, setHideCronSessions] = useState(false);
  const [dismissedPrompts, setDismissedPrompts] = useState<string[]>([]);
  const [messageDetail, setMessageDetail] = useState<{ title: string; body: string } | null>(null);
  const [feedbackPrompt, setFeedbackPrompt] = useState<{
    message: HermesMessage;
    signal: 'up' | 'down';
  } | null>(null);

  const applyChatApiError = useCallback(
    (error: unknown, fallback: string, options?: { background?: boolean }) => {
      const { kind, message } = humanizeChatError(error, fallback, { gatewayUrl });
      if (kind === 'connectivity') {
        refreshHealth();
        return;
      }
      if (options?.background) {
        return;
      }
      setErrorMessage(message);
    },
    [refreshHealth],
  );

  const flatListRef = useRef<FlashListRef<HermesMessage>>(null);
  const isSendingRef = useRef(false);
  const userNearBottomRef = useRef(true);
  const messagesRef = useRef<HermesMessage[]>([]);
  const sessionsLoadGenRef = useRef(0);
  const sendStartedAtRef = useRef(Date.now());
  const outboundQueueRef = useRef<string[]>([]);
  /** In-flight mobile sends with optimistic bubbles not yet on gateway transcript. */
  const pendingOutboundSendsRef = useRef(0);
  const outboundMessageSeqRef = useRef(0);
  const activeAssistantIdRef = useRef<string | null>(null);
  const activeAssistantTextRef = useRef<string>('');
  const isLoadingMessagesRef = useRef(false);
  const isPullRefreshingRef = useRef(false);
  const sessionsRef = useRef(sessions);
  const currentSessionRef = useRef(currentSession);
  const telegramReplySessionIdRef = useRef(telegramReplySessionId);
  const refreshSessionMessagesRef = useRef<
    ((options?: { background?: boolean; manual?: boolean }) => Promise<void>) | null
  >(null);
  const inputFocusedRef = useRef(false);
  /** Android-only: one re-render when composer focuses so padding latches before keyboard inset. */
  const [composerLayoutNonce, setComposerLayoutNonce] = useState(0);
  const pendingTranscriptSyncRef = useRef(false);
  const transcriptSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const deferredTelegramPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runProgressRef = useRef<RunProgressState | null>(null);
  const sendProgressSnapshotRef = useRef<RunProgressState | null>(null);
  const transcriptDigestRef = useRef('');
  /** Ignore spurious onChangeText after Send clears the field (Android IME blur). */
  const sendClearSuppressRef = useRef(false);
  const lastSentComposerTextRef = useRef('');
  const sendUserTextRef = useRef<(text: string, isProgrammatic?: boolean) => Promise<boolean>>(
    async () => false,
  );
  const lastFailedSendTextRef = useRef<string | null>(null);
  const activeChatStreamRef = useRef(false);

  const { inset: keyboardInset, windowShrunk: keyboardWindowShrunk } = useKeyboardInset({
    suppressHideWhileFocusedRef: inputFocusedRef,
  });

  const [queuedOutboundCount, setQueuedOutboundCount] = useState(0);
  const [pinnedOutboundText, setPinnedOutboundText] = useState<string | null>(null);
  const [pinnedOutboundStatus, setPinnedOutboundStatus] = useState<'pending' | 'sent' | 'failed'>(
    'pending',
  );
  const [connectingStuck, setConnectingStuck] = useState(false);
  const connectingSinceRef = useRef<number | null>(null);

  messagesRef.current = messages;
  sessionsRef.current = sessions;
  isLoadingMessagesRef.current = isLoadingMessages;
  isPullRefreshingRef.current = isPullRefreshing;
  currentSessionRef.current = currentSession;
  telegramReplySessionIdRef.current = telegramReplySessionId;
  runProgressRef.current = runProgress;

  const commitMessages = useCallback((updater: React.SetStateAction<HermesMessage[]>) => {
    setMessages((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      messagesRef.current = next;
      return next;
    });
  }, []);

  const scrollChatToLatest = useCallback((animated = false) => {
    // Bottom-anchored FlashList (startRenderingFromBottom): offset 0 is the latest messages.
    const run = () => flatListRef.current?.scrollToOffset({ offset: 0, animated });
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
  }, []);

  const scrollChatToLatestIfPinned = useCallback(
    (animated = false, force = false) => {
      if (force || userNearBottomRef.current || isSendingRef.current) {
        scrollChatToLatest(animated);
      }
    },
    [scrollChatToLatest],
  );

  const handleChatScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    userNearBottomRef.current = isChatNearBottom(
      layoutMeasurement.height,
      contentOffset.y,
      contentSize.height,
    );
  }, []);

  const isDemo = useMemo(() => {
    if (!isDemoModeAllowed()) {
      return false;
    }
    return settings.demoMode || connectionState === 'demo';
  }, [settings.demoMode, connectionState]);

  useEffect(() => {
    if (isDemo || !gatewayUrl.trim()) {
      setGatewayModel(undefined);
      return;
    }
    let cancelled = false;
    void getCapabilities(gatewayUrl, apiKey)
      .then((caps) => {
        if (cancelled) {
          return;
        }
        const model = displayableLlmModel(caps.model);
        if (model) {
          setGatewayModel(model);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiKey, gatewayUrl, isDemo]);

  const macHttpOk = useMemo(() => isMacGatewayHttpOk(health), [health]);
  const healthProbePending = useMemo(() => isGatewayHealthPending(health), [health]);
  const usbCableLikely = useMemo(
    () => Platform.OS === 'android' && isLoopbackGatewayUrl(gatewayUrl) && macHttpOk,
    [gatewayUrl, macHttpOk],
  );
  const usbHostMismatch = useMemo(
    () =>
      detectUsbHostMismatch({
        activeProfile: activeGatewayProfile,
        gatewayUrl,
        healthHostname: health?.hostname,
        profiles: gatewayProfiles,
        macHttpOk,
      }),
    [activeGatewayProfile, gatewayUrl, health?.hostname, gatewayProfiles, macHttpOk],
  );
  const cellularBlocksDirect = useMemo(
    () => !wifiConnected && isPrivateLanGatewayUrl(gatewayUrl),
    [wifiConnected, gatewayUrl],
  );
  /** Chat needs direct HTTP to the Mac — relay WebSocket "connected" is not enough. */
  const macChatLive = isDemo || macHttpOk;
  const macLiveSocket = isDemo || connectionState === 'connected';
  const connectionHeal = useMemo(
    () => connectionHealSnapshot(connectionHealAttempt, connectionHealInFlight),
    [connectionHealAttempt, connectionHealInFlight],
  );
  const alternateHealRoutes = useMemo(
    () =>
      hasAlternateHealRoutes({
        gatewayUrl,
        profiles: gatewayProfiles,
        tailscaleDiscoveries,
      }),
    [gatewayUrl, gatewayProfiles, tailscaleDiscoveries],
  );
  const userSendFailed = pinnedOutboundStatus === 'failed';
  const showMacConnectionHelp = shouldShowMacConnectionHelp({
    isDemo,
    macChatLive,
    healthProbePending,
    healthLevel: health?.level,
    heal: connectionHeal,
    userSendFailed,
  });
  const showMacRetryBanner = shouldShowMacRetryBanner({
    isDemo,
    macChatLive,
    healthProbePending,
    runProgressFailed: runProgress?.phase === 'failed',
    heal: connectionHeal,
    userSendFailed,
  });
  const showChatEmptyState = useMemo(() => {
    if (messages.length > 0) {
      return false;
    }
    if (pinnedOutboundText?.trim()) {
      return false;
    }
    if (isSending) {
      return false;
    }
    if (messages.some((message) => message.role === 'user' && message.id?.startsWith('user-'))) {
      return false;
    }
    return true;
  }, [messages, pinnedOutboundText, isSending]);

  const showSubmittedPromptStrip = useMemo(
    () => shouldShowSubmittedPromptStrip(pinnedOutboundText, messages),
    [pinnedOutboundText, messages],
  );

  useEffect(() => {
    if (connectionState !== 'connecting') {
      connectingSinceRef.current = null;
      setConnectingStuck(false);
      return;
    }
    if (!connectingSinceRef.current) {
      connectingSinceRef.current = Date.now();
    }
    const timer = setTimeout(() => {
      setConnectingStuck(true);
      void refreshHealth();
    }, 5000);
    return () => clearTimeout(timer);
  }, [connectionState, refreshHealth]);

  useEffect(() => {
    const handleEvent = (event: GatewayEventMessage) => {
      const eventName = String(event.event ?? '').toLowerCase();
      const payload = event.payload ?? {};
      const eventSessionId = typeof payload.sessionId === 'string'
        ? payload.sessionId
        : typeof payload.session_id === 'string'
          ? payload.session_id
          : undefined;

      const activeSession = currentSessionRef.current;
      const targetSessionId = isTelegramInboxSession(activeSession) ? telegramReplySessionIdRef.current : activeSession?.id;
      if (eventSessionId && eventSessionId !== targetSessionId) {
        return;
      }

      if (eventName === 'assistant.delta' && typeof payload.delta === 'string') {
        const delta = payload.delta;
        activeAssistantTextRef.current += delta;
        const currentText = activeAssistantTextRef.current.trim();
        if (currentText && activeAssistantIdRef.current) {
          const assistantId = activeAssistantIdRef.current;
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === assistantId);
            if (!exists) {
              const next = [
                ...prev,
                {
                  id: assistantId,
                  role: 'assistant',
                  content: currentText,
                  created_at: new Date().toISOString(),
                },
              ];
              messagesRef.current = next;
              return next;
            }
            const next = prev.map((m) => (m.id === assistantId ? { ...m, content: currentText } : m));
            messagesRef.current = next;
            return next;
          });
          scrollChatToLatestIfPinned(true, true);
        }
      }
    };

    addGatewayListener(handleEvent);
    return () => removeGatewayListener(handleEvent);
  }, [addGatewayListener, removeGatewayListener, scrollChatToLatestIfPinned]);

  const operationalError =
    errorMessage && !isConnectivityMessage(errorMessage) ? errorMessage : null;
  const showSessionBusyStop = Boolean(
    operationalError?.toLowerCase().includes('still on the previous chat'),
  );

  useEffect(() => {
    if (!showMacConnectionHelp || isDemo) {
      return;
    }
    void probeTailscaleComputers();
  }, [showMacConnectionHelp, isDemo, probeTailscaleComputers]);

  const handleSearchMacFromChat = useCallback(async () => {
    haptics.selection();
    setIsScanningMacs(true);
    try {
      const scanned = await scanForGatewayProfiles();

      const active = activeGatewayProfile;
      const isLoopbackActive = active ? isLoopbackGatewayUrl(active.gatewayUrl) : true;
      const isInvalidActive = active ? isInvalidGatewayProfile(active) : true;
      const isActiveReachable = isMacGatewayHttpOk(health);

      if (isInvalidActive || isLoopbackActive || !isActiveReachable) {
        // Find a healthy, valid LAN profile from the scanned list
        const lanProfile = scanned.find(
          (p) => !isLoopbackGatewayUrl(p.gatewayUrl) && !isInvalidGatewayProfile(p),
        );
        if (lanProfile) {
          await selectGatewayProfile(lanProfile.id);
        }
      }

      await retryGatewayBootstrap();
      await autoConnectGateway();
      await refreshHealth();
      connectEvents();
      void probeTailscaleComputers();
    } finally {
      setIsScanningMacs(false);
    }
  }, [
    activeGatewayProfile,
    autoConnectGateway,
    connectEvents,
    health,
    probeTailscaleComputers,
    refreshHealth,
    retryGatewayBootstrap,
    scanForGatewayProfiles,
    selectGatewayProfile,
  ]);

  const handleConnectionPanelRefresh = useCallback(async () => {
    if (connectionPanelRefreshing || isScanningMacs) {
      return;
    }
    haptics.light();
    setConnectionPanelRefreshing(true);
    try {
      await refreshHealth();
      await retryGatewayBootstrap();
      await autoConnectGateway();
      connectEvents();
      void probeTailscaleComputers();
    } finally {
      setConnectionPanelRefreshing(false);
    }
  }, [
    autoConnectGateway,
    connectEvents,
    connectionPanelRefreshing,
    isScanningMacs,
    probeTailscaleComputers,
    refreshHealth,
    retryGatewayBootstrap,
  ]);

  useEffect(() => {
    if (macChatLive) {
      setErrorMessage((prev) => (prev && isConnectivityMessage(prev) ? null : prev));
    }
  }, [macChatLive]);

  const activeProject = useMemo(() => {
    if (!projectState.activeProjectId) return null;
    return projectState.projects.find((p) => p.id === projectState.activeProjectId) ?? null;
  }, [projectState]);

  const contextProject = useMemo(
    () => resolveChatProject(projectState, currentSession?.id),
    [projectState, currentSession?.id],
  );

  const sessionLabelFor = useCallback(
    (session: HermesSession) =>
      sessionPickerLabel(session, {
        sessionLabels: projectState.sessionLabels,
        projectName: projectNameForSession(projectState, session.id),
      }),
    [projectState],
  );

  const machineHeaderDisplay = useMemo(
    () =>
      resolveChatMachineHeaderDisplay({
        activeProfile: activeGatewayProfile,
        gatewayUrl,
        health,
        connectionMode: settings.connectionMode,
        isPaired,
        workers: relayWorkers,
        activeWorkerId: activeRelayWorkerId,
        savedMacCount: gatewayProfiles.length,
      }),
    [
      activeGatewayProfile,
      gatewayUrl,
      health,
      settings.connectionMode,
      isPaired,
      relayWorkers,
      activeRelayWorkerId,
      gatewayProfiles.length,
    ],
  );

  const relayRouteDisplay = useMemo(
    () =>
      resolveRelayRouteDisplay({
        connectionMode: settings.connectionMode,
        isPaired,
        connectionState,
        workers: relayWorkers,
        activeWorkerId: activeRelayWorkerId,
        fallbackMachineLabel: machineHeaderDisplay.machineLabel,
        fallbackEndpoint: machineHeaderDisplay.machineEndpoint,
        heal: connectionHeal,
        hasAlternateRoutes: alternateHealRoutes,
        wifiConnected,
        gatewayUrl,
        macHttpOk,
      }),
    [
      settings.connectionMode,
      isPaired,
      connectionState,
      relayWorkers,
      activeRelayWorkerId,
      machineHeaderDisplay.machineLabel,
      machineHeaderDisplay.machineEndpoint,
      connectionHeal,
      alternateHealRoutes,
      wifiConnected,
      gatewayUrl,
      macHttpOk,
    ],
  );

  const routeStatusLabel =
    settings.connectionMode === 'relay' &&
    !isPaired &&
    relayRouteDisplay.routeStatus !== 'Direct link'
      ? relayRouteDisplay.routeStatus
      : undefined;

  const machineShortLabel = machineHeaderDisplay.machineLabel;
  const machineEndpoint = machineHeaderDisplay.machineEndpoint;

  const macRetryBannerText = useMemo(() => {
    if (macRetryBusy || connectionHealInFlight) {
      return `Reconnecting to ${machineShortLabel}…`;
    }
    return formatMacConnectionRetryBanner({
      connectionState,
      connectingStuck,
      gatewayUrl,
      health,
      activeProfile: activeGatewayProfile,
      machineLabel: machineHeaderDisplay.machineLabel,
      machineEndpoint: machineHeaderDisplay.machineEndpoint,
    });
  }, [
    macRetryBusy,
    machineShortLabel,
    connectionState,
    connectingStuck,
    gatewayUrl,
    health,
    activeGatewayProfile,
    machineHeaderDisplay.machineLabel,
    machineHeaderDisplay.machineEndpoint,
  ]);

  const threadHeaderTitle = useMemo(() => {
    if (currentSession) {
      return formatSessionTitle(currentSession, {
        sessionLabels: projectState.sessionLabels,
        projectName: projectNameForSession(projectState, currentSession.id),
      });
    }
    return 'New chat';
  }, [currentSession, projectState]);

  /** Lift composer above software keyboard; tab bar stays mounted (no height collapse). */
  const androidKeyboardMode = Constants.expoConfig?.android?.softwareKeyboardLayoutMode;
  const composerDockSpacing = useMemo(
    () =>
      composerDockInsets(
        keyboardInset,
        insets.bottom,
        androidKeyboardMode,
        keyboardWindowShrunk,
        keyboardInset > 0 ? 0 : ANDROID_TAB_BAR_ESTIMATE_PX,
      ),
    [keyboardInset, insets.bottom, androidKeyboardMode, keyboardWindowShrunk, composerLayoutNonce],
  );
  const keyboardOpen = keyboardInset > 0;

  const leashPhraseHints = useMemo((): LeashPhraseHint[] => {
    const hints: LeashPhraseHint[] = [];
    for (const pending of pendingApprovals) {
      const phrase = pending.approveText ?? pending.command;
      if (!phrase?.trim()) {
        continue;
      }
      hints.push({
        phrase: phrase.trim(),
        title: pending.reason,
      });
    }
    return hints;
  }, [pendingApprovals]);

  const inlineTextApprovals = useMemo(
    () => listInlineTextApprovals(messages, resolvedApprovalKeys, leashPhraseHints),
    [messages, resolvedApprovalKeys, leashPhraseHints],
  );

  const composerApprovalQueue = useMemo((): HermesApprovalRequest[] => {
    const queue: HermesApprovalRequest[] = [];
    const seen = new Set<string>();

    const addRequest = (request: HermesApprovalRequest) => {
      const dedupeKey = request.approveText?.trim().toUpperCase() ?? request.id;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      queue.push(request);
    };

    if (pendingRunApproval) {
      addRequest(
        enrichApprovalRequest(fromChatRunApproval(pendingRunApproval), settings.approvalPolicy),
      );
    }

    for (const pending of pendingApprovals) {
      const isRun =
        pending.runId ||
        pending.actionId.startsWith('run_') ||
        pending.source === 'gateway_guard';
      const isText =
        pending.source === 'text_nudge' || pending.actionId.startsWith('text-nudge');
      if (!isRun && !isText) {
        continue;
      }
      addRequest(enrichApprovalRequest(fromPendingApproval(pending, settings.approvalPolicy), settings.approvalPolicy));
    }

    for (const textApproval of listAllPendingTextApprovals(
      messages,
      resolvedApprovalKeys,
      leashPhraseHints,
    )) {
      addRequest(
        enrichApprovalRequest(fromChatTextApproval(textApproval), settings.approvalPolicy),
      );
    }

    return queue;
  }, [
    pendingRunApproval,
    pendingApprovals,
    messages,
    resolvedApprovalKeys,
    leashPhraseHints,
    settings.approvalPolicy,
  ]);

  const composerApprovals = useMemo((): HermesApprovalRequest[] => {
    return composerApprovalQueue.filter((request) => {
      if (request.source !== 'text_nudge' || !request.approveText) {
        return true;
      }
      const phrase = request.approveText.trim().toUpperCase();
      for (const inline of inlineTextApprovals.values()) {
        if (inline.approveText.trim().toUpperCase() === phrase) {
          return false;
        }
      }
      return true;
    });
  }, [composerApprovalQueue, inlineTextApprovals]);

  useEffect(() => {
    setResolvedApprovalKeys(new Set());
    setOperatorTerminalLine(null);
  }, [currentSession?.id]);

  const prevPendingApprovalsRef = useRef(pendingApprovals);
  useEffect(() => {
    const prev = prevPendingApprovalsRef.current;
    const removed = prev.filter(
      (item) => !pendingApprovals.some((next) => next.actionId === item.actionId),
    );
    if (removed.length > 0) {
      setResolvedApprovalKeys((prevKeys) => {
        const next = new Set(prevKeys);
        for (const pending of removed) {
          const phrase = pending.approveText ?? pending.command;
          if (!phrase) {
            continue;
          }
          next.add(nudgeResolutionKey({ approveText: phrase }));
        }
        return next;
      });
    }
    prevPendingApprovalsRef.current = pendingApprovals;
  }, [pendingApprovals, messages]);

  useFocusEffect(
    useCallback(() => {
      if (pendingApprovalEditSeed) {
        setInputValue(pendingApprovalEditSeed);
        clearApprovalEditSeed();
      }
    }, [pendingApprovalEditSeed, clearApprovalEditSeed]),
  );

  useEffect(() => {
    if (undoSecondsLeft <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setUndoSecondsLeft((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [undoSecondsLeft]);

  const mobileChatSystemPrompt = useMemo(
    () => buildMobileChatSystemPrompt(contextProject?.workspacePath, settings.hermesPersona),
    [contextProject?.workspacePath, settings.hermesPersona],
  );

  const visibleSessions = useMemo(() => {
    let list: HermesSession[];
    if (!activeProject) {
      list = sessions;
    } else {
      const filtered = projectSessions(sessions, projectState, activeProject.id);
      list = filtered.length > 0 ? filtered : sessions;
    }
    return filterDismissedThreadSessions(list, {
      dismissedSessionIds,
      hideCronSessions,
    });
  }, [sessions, projectState, activeProject, dismissedSessionIds, hideCronSessions]);

  dismissedSessionIdsRef.current = dismissedSessionIds;
  hideCronSessionsRef.current = hideCronSessions;

  const recentsRailSessions = useMemo(
    () => visibleSessions.filter((session) => isRecentsRailSession(session)),
    [visibleSessions],
  );

  const hasAssistantReply = useMemo(
    () => hasAssistantReplyInMessages(messages),
    [messages],
  );

  const showRecentChatsPanel = useMemo(
    () =>
      shouldShowRecentChatsPanel({
        macChatLive,
        showMacConnectionHelp,
        visibleSessionCount: visibleSessions.length,
        showChatEmptyState,
        isLoadingMessages,
        messageCount: messages.length,
        hasAssistantReply,
        recentChatsDismissed,
      }),
    [
      macChatLive,
      showMacConnectionHelp,
      visibleSessions.length,
      showChatEmptyState,
      isLoadingMessages,
      messages.length,
      hasAssistantReply,
      recentChatsDismissed,
    ],
  );

  const sessionPickerShowsAllMacSessions = useMemo(() => {
    if (!activeProject || sessions.length === 0) {
      return false;
    }
    const filtered = projectSessions(sessions, projectState, activeProject.id);
    return filtered.length === 0;
  }, [sessions, projectState, activeProject]);

  const sessionPickerSections = useMemo(
    () => buildSessionPickerSections(visibleSessions),
    [visibleSessions],
  );

  const pendingApprovalSessionIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentSession?.id && composerApprovals.length > 0) {
      ids.add(currentSession.id);
    }
    for (const pending of pendingApprovals) {
      if (pending.sessionKey) {
        ids.add(pending.sessionKey);
      }
    }
    return ids;
  }, [composerApprovals.length, currentSession?.id, pendingApprovals]);

  const isTelegramView = useMemo(
    () =>
      currentSession &&
      (isTelegramInboxSession(currentSession) || isTelegramSession(currentSession)),
    [currentSession?.id, currentSession?.source],
  );

  const inputPlaceholder = useMemo(() => {
    if (!currentSession) {
      return 'Message your Mac…';
    }
    if (isSending) {
      return queuedOutboundCount > 0
        ? 'Message queued — send again or keep typing'
        : 'Sending… you can type your next message';
    }
    if (runProgress && runProgress.phase !== 'completed' && runProgress.phase !== 'failed') {
      return 'Add another message…';
    }
    if (isTelegramInboxSession(currentSession) && telegramReplySessionId) {
      const session = sessions.find((s) => s.id === telegramReplySessionId);
      const label = session ? sessionDisplayTitle(session) : telegramReplySessionId;
      return `Message → ${label}`;
    }
    if (isTelegramSession(currentSession)) {
      return 'Message Hermes on this thread';
    }
    return 'Type a message to Hermes';
  }, [currentSession, currentSession?.id, currentSession?.source, telegramReplySessionId, sessions, isSending, queuedOutboundCount, runProgress?.phase]);

  useEffect(() => {
    chatProjects.load().then((loaded) => {
      if (isDemo && loaded.projects.length === 0) {
        const demoState: ChatProjectState = {
          projects: [
            {
              id: 'demo-skool',
              name: 'skool_top1percent',
              workspacePath: '~/workspace/git/igor/skool_top1percent',
              sessionIds: ['demo-1'],
              activeSessionId: 'demo-1',
            },
            {
              id: 'demo-thumbgate',
              name: 'ThumbGate',
              workspacePath: '~/workspace/git/igor/ThumbGate',
              sessionIds: ['demo-2'],
              activeSessionId: 'demo-2',
            },
          ],
          sessionProjectMap: { 'demo-1': 'demo-skool', 'demo-2': 'demo-thumbgate' },
          sessionLabels: {},
          activeProjectId: 'demo-skool',
        };
        setProjectState(demoState);
        setIsProjectsLoaded(true);
        return;
      }
      setProjectState(loaded);
      setIsProjectsLoaded(true);
    });
  }, [isDemo]);

  useEffect(() => {
    if (!isDemo || projectState.projects.length === 0) return;
    const active = projectState.projects.find((p) => p.id === projectState.activeProjectId);
    const sessionId = active?.activeSessionId ?? active?.sessionIds[0];
    if (!sessionId) return;
    const match = sessions.find((s) => s.id === sessionId);
    if (match && currentSession?.id !== sessionId) {
      setCurrentSession(match);
    }
  }, [isDemo, projectState, sessions, currentSession?.id]);

  const persistProjectState = async (next: ChatProjectState) => {
    setProjectState(next);
    await chatProjects.save(next);
  };

  const selectProject = async (project: ChatProject) => {
    haptics.selection();
    const next = setActiveProject(projectState, project.id);
    await persistProjectState(next);
    const boundSessionId = project.activeSessionId ?? project.sessionIds[0];
    if (boundSessionId) {
      const match = sessions.find((s) => s.id === boundSessionId);
      if (match) {
        setCurrentSession(match);
        return;
      }
    }
    setCurrentSession(null);
    setMessages([]);
  };

  const handlePickWorkspace = useCallback(() => {
    if (projectState.projects.length <= 1) {
      return;
    }
    haptics.selection();
    Alert.alert(
      'Workspace',
      'Hermes runs in this folder on your Mac.',
      [
        ...projectState.projects.map((project) => ({
          text: project.name,
          onPress: () => void selectProject(project),
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [projectState.projects, selectProject]);

  const handleAddProject = async () => {
    const path = newProjectPath.trim();
    if (!path) {
      setErrorMessage('Enter a workspace path (e.g. ~/workspace/git/igor/ThumbGate)');
      return;
    }
    haptics.selection();
    const next = await chatProjects.addProject(path, newProjectName.trim() || undefined);
    setProjectState(next);
    setNewProjectPath('');
    setNewProjectName('');
    setProjectModalVisible(false);
    setCurrentSession(null);
    setMessages([]);
  };

  const loadSessionsList = async (
    selectLatest = false,
    options?: { silent?: boolean },
  ) => {
    const loadGen = ++sessionsLoadGenRef.current;
    if (isDemo) {
      const mockSessions: HermesSession[] = [
        { id: 'demo-1', title: 'safeguards setup inquiry', last_active_at: new Date().toISOString() },
        { id: 'demo-2', title: 'fixing runaway simulators loop', last_active_at: new Date(Date.now() - 3600000).toISOString() },
      ].filter(s => !deletedDemoSessionIdsRef.current.has(s.id));
      setSessions(mockSessions);

      let nextSession: HermesSession | null = null;
      if (activeProject) {
        const activeProj = projectState.projects.find((p) => p.id === activeProject.id);
        const lastSessionId = activeProj?.activeSessionId;
        if (lastSessionId) {
          nextSession = mockSessions.find((s) => s.id === lastSessionId) || null;
        }
      }
      if (!nextSession && selectLatest && mockSessions.length > 0) {
        const activeProj = activeProject ? projectState.projects.find((p) => p.id === activeProject.id) : null;
        const hasBound = activeProj ? (activeProj.sessionIds || []).length > 0 : false;
        if (!activeProject || hasBound) {
          nextSession = mockSessions[0];
        }
      }
      if (nextSession) {
        setCurrentSession(nextSession);
      }
      return;
    }

    if (!macChatLive) {
      if (loadGen === sessionsLoadGenRef.current) {
        setIsLoadingSessions(false);
      }
      return;
    }

    try {
      if (!options?.silent) {
        setIsLoadingSessions(true);
      }
      setErrorMessage(null);
      const list = await listSessions(gatewayUrl, apiKey);
      const hasTelegram = list.some(isTelegramSession);
      const finalSessions = hasTelegram ? [buildTelegramInboxSession(), ...list] : list;
      setSessions(finalSessions);

      if (currentSessionRef.current && isTelegramInboxSession(currentSessionRef.current)) {
        const replyId = resolveTelegramInboxReplySessionId(list);
        if (replyId) {
          setTelegramReplySessionId(replyId);
        }
      }

      // Determine the next session to select to avoid stale/ghost selected sessions
      let nextSession: HermesSession | null = null;

      // 1. Try to find the preferred session for the active project
      if (projectState.activeProjectId) {
        const project = projectState.projects.find((p) => p.id === projectState.activeProjectId);
        const preferredId = project?.activeSessionId ?? project?.sessionIds[0];
        if (preferredId) {
          const match = finalSessions.find((s) => s.id === preferredId);
          if (match) {
            nextSession = match;
          }
        }
      }

      // 2. If no preferred session resolved, check if currently selected session still exists on the server
      if (!nextSession && currentSession) {
        const match = finalSessions.find((s) => s.id === currentSession.id);
        if (match) {
          nextSession = match;
        }
      }

      // 3. Default session — skip after + (new chat) so we don't immediately re-open the last thread
      if (!nextSession && finalSessions.length > 0) {
        if (skipSessionAutoSelectRef.current) {
          skipSessionAutoSelectRef.current = false;
        } else if (selectLatest || !currentSessionRef.current) {
          nextSession = pickDefaultSession(finalSessions, projectState) ?? finalSessions[0];
        }
      }

      // 4. Update the active session
      setCurrentSession(nextSession);
    } catch (err) {
      applyChatApiError(err, 'Could not load your chats from the computer.');
    } finally {
      if (loadGen === sessionsLoadGenRef.current) {
        setIsLoadingSessions(false);
      }
    }
  };

  const openSessionsModal = useCallback(() => {
    haptics.selection();
    setSessionModalVisible(true);
    void loadSessionsList(false, { silent: sessions.length > 0 });
  }, [sessions.length]);

  useEffect(() => {
    if (isDemo) {
      setDismissedSessionIds([]);
      setHideCronSessions(false);
      return;
    }
    const hydrationGen = ++dismissedHydrationGenRef.current;
    let cancelled = false;
    void Promise.all([
      storage.loadDismissedSessionIds(gatewayUrl),
      storage.loadHideCronSessions(gatewayUrl),
    ]).then(([ids, hideCron]) => {
      if (!cancelled && hydrationGen === dismissedHydrationGenRef.current) {
        setDismissedSessionIds(ids);
        setHideCronSessions(hideCron);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [gatewayUrl, isDemo]);

  useEffect(() => {
    let cancelled = false;
    void storage.loadDismissedPrompts().then((prompts) => {
      if (!cancelled) {
        setDismissedPrompts(prompts || []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isProjectsLoaded) {
      loadSessionsList(true);
    }
  }, [isProjectsLoaded, isDemo, gatewayUrl, apiKey, macChatLive]);

  useEffect(() => {
    if (!notificationFocusSessionId) {
      return;
    }
    const focusId = notificationFocusSessionId;
    const existing = sessionsRef.current.find((s) => s.id === focusId);
    if (existing) {
      setCurrentSession(existing);
      clearNotificationFocusSession();
      return;
    }
    void loadSessionsList(false, { silent: sessions.length > 0 }).then(() => {
      const match = sessionsRef.current.find((s) => s.id === focusId);
      if (match) {
        setCurrentSession(match);
      }
      clearNotificationFocusSession();
    });
  }, [notificationFocusSessionId, clearNotificationFocusSession, sessions.length]);

  useEffect(() => {
    if (!currentSession || !isTelegramInboxSession(currentSession)) {
      return;
    }
    const replyId = resolveTelegramInboxReplySessionId(sessions);
    if (replyId && replyId !== telegramReplySessionId) {
      setTelegramReplySessionId(replyId);
    }
  }, [sessions, currentSession?.id, telegramReplySessionId]);

  const refreshSessionMessages = useCallback(
    async (options?: { background?: boolean; manual?: boolean }) => {
      const activeSession = currentSessionRef.current;
      if (!activeSession) {
        transcriptDigestRef.current = '';
        setMessages([]);
        return;
      }

      if (!macChatLive) {
        const localSnapshot = messagesRef.current;
        if (
          pendingOutboundSendsRef.current > 0 ||
          hasUnsyncedLocalMessages(localSnapshot) ||
          localSnapshot.length > 0
        ) {
          return;
        }
        transcriptDigestRef.current = '';
        setMessages([]);
        return;
      }



      if (refreshInFlightRef.current) {
        if (options?.background || options?.manual) {
          refreshQueuedRef.current = true;
        }
        return;
      }
      refreshInFlightRef.current = true;

      const applyMergedMessages = (merged: HermesMessage[]) => {
        const digest = transcriptDigest(merged);
        if (digest === transcriptDigestRef.current) {
          return;
        }
        transcriptDigestRef.current = digest;
        messagesRef.current = merged;
        setMessages(merged);
      };

      const mergeWithLocalPending = (serverMessages: HermesMessage[]) => {
        const localSnapshot = messagesRef.current;
        if (pendingOutboundSendsRef.current > 0 || hasUnsyncedLocalMessages(localSnapshot)) {
          return mergeServerMessagesWithPending(serverMessages, localSnapshot);
        }
        return serverMessages;
      };

      if (isDemo) {
        let seedMessages: HermesMessage[] = [];
        if (activeSession.id === 'demo-1') {
          seedMessages = [
            {
              role: 'user',
              content: 'What is the yolo-health check score?',
              created_at: '2026-06-19T10:30:00.000Z',
            },
            {
              role: 'assistant',
              content:
                'Your yolo-health check score is currently 100/100. All safeguards are active and the LaunchAgent is running.',
              created_at: '2026-06-19T10:30:05.000Z',
            },
          ];
        } else if (activeSession.id === 'demo-2') {
          seedMessages = [
            {
              role: 'user',
              content: 'Simulators are spawning in a loop, help!',
              created_at: '2026-06-19T09:15:00.000Z',
            },
            {
              role: 'assistant',
              content:
                'I detected 62 active simulator processes. Running sim-runaway-guard.sh to auto-terminate runaway runtimes and reclaim memory.',
              created_at: '2026-06-19T09:15:12.000Z',
            },
          ];
        }
        applyMergedMessages(mergeWithLocalPending(seedMessages));
        refreshInFlightRef.current = false;
        return;
      }

      try {
        if (options?.manual) {
          setIsPullRefreshing(true);
        } else if (!options?.background && messagesRef.current.length === 0) {
          setIsLoadingMessages(true);
        }
        setErrorMessage(null);
        if (isTelegramInboxSession(activeSession)) {
          const { messages: tgMessages, replySessionId, threadCount, messageCap } =
            await fetchTelegramInboxMessages(
              gatewayUrl,
              sessionsRef.current,
              apiKey,
              undefined,
              undefined,
              {
                includeToolActivity: settings.includeToolActivity,
                includeHermesStatus: true,
              },
            );
          applyMergedMessages(mergeWithLocalPending(dedupeChatMessages(tgMessages)));
          setTelegramReplySessionId(replySessionId);
          setTelegramInboxMeta({ threadCount, messageCap });
        } else {
          const history = await listMessages(gatewayUrl, activeSession.id, apiKey);
          const displayMessages = dedupeChatMessages(
            prepareMessagesForDisplay(history, {
              includeToolActivity: settings.includeToolActivity,
              includeHermesStatus: true,
            }),
          );
          applyMergedMessages(mergeWithLocalPending(displayMessages));
          setTelegramReplySessionId('');
          setTelegramInboxMeta({ threadCount: 0, messageCap: 0 });
        }
      } catch (err) {
        applyChatApiError(err, 'Could not load messages from your computer.', options);
      } finally {
        setIsLoadingMessages(false);
        setIsPullRefreshing(false);
        refreshInFlightRef.current = false;
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          queueMicrotask(() => {
            void refreshSessionMessages({ background: true });
          });
        }
      }
    },
    [isDemo, gatewayUrl, apiKey, settings.includeToolActivity, applyChatApiError],
  );

  refreshSessionMessagesRef.current = refreshSessionMessages;

  const clearDeferredTelegramPoll = useCallback(() => {
    if (deferredTelegramPollRef.current) {
      clearInterval(deferredTelegramPollRef.current);
      deferredTelegramPollRef.current = null;
    }
  }, []);

  const startDeferredTelegramPoll = useCallback(
    (assistantId: string, priorAssistants: Set<string>) => {
      clearDeferredTelegramPoll();
      const startedAt = Date.now();
      deferredTelegramPollRef.current = setInterval(() => {
        if (Date.now() - startedAt > 90_000) {
          clearDeferredTelegramPoll();
          setToolStatus(null);
          setRunProgress(null);
          return;
        }
        void refreshSessionMessages({ background: true }).then(() => {
          const reply = findNewAssistantReply(messagesRef.current, priorAssistants);
          if (!reply) {
            return;
          }
          clearDeferredTelegramPoll();
          setToolStatus(null);
          setRunProgress(null);
          commitMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: reply } : m)),
          );
          haptics.success();
        });
      }, 3000);
    },
    [clearDeferredTelegramPoll, refreshSessionMessages, commitMessages],
  );

  useEffect(() => {
    return () => {
      clearDeferredTelegramPoll();
    };
  }, [clearDeferredTelegramPoll]);

  useEffect(() => {
    setChatStreamProgressActive(isSending);
    if (!isSending) {
      sendProgressSnapshotRef.current = null;
    }
  }, [isSending, setChatStreamProgressActive]);

  const failPendingOutboundBubbles = useCallback(
    (failureReason: string) => {
      let failedText: string | null = null;
      commitMessages((prev) => {
        let changed = false;
        const next = prev.map((message) => {
          if (message.role?.toLowerCase() !== 'user' || message.outboundStatus !== 'pending') {
            return message;
          }
          changed = true;
          if (!failedText?.trim()) {
            failedText = message.content?.trim() || null;
          }
          return {
            ...message,
            outboundStatus: 'failed' as const,
            outboundFailureReason: failureReason,
          };
        });
        return changed ? next : prev;
      });
      if (failedText) {
        lastFailedSendTextRef.current = failedText;
      }
      pendingOutboundSendsRef.current = 0;
      setPinnedOutboundStatus('failed');
      setPinnedOutboundText(null);
    },
    [commitMessages],
  );

  useEffect(() => {
    if (isDemo || !isSending) {
      return;
    }
    const startedAt = sendStartedAtRef.current;
    const timer = setTimeout(() => {
      if (!isSendingRef.current) {
        return;
      }
      if (
        !shouldRecoverOutboundSendLock(startedAt, Date.now(), {
          streamInFlight: activeChatStreamRef.current,
        })
      ) {
        return;
      }
      isSendingRef.current = false;
      setIsSending(false);
      failPendingOutboundBubbles(OUTBOUND_STUCK_FAILURE_REASON);
      setRunProgress((prev) =>
        prev && prev.phase !== 'completed' && prev.phase !== 'failed'
          ? { ...prev, phase: 'failed', detail: OUTBOUND_STUCK_FAILURE_REASON }
          : prev,
      );
      haptics.warning();
    }, OUTBOUND_SEND_LOCK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [failPendingOutboundBubbles, isDemo, isSending, setRunProgress]);

  useEffect(() => {
    if (isDemo || isSending || activeChatStreamRef.current) {
      return;
    }
    const pendingMessages = messages.filter(
      (message) => message.role?.toLowerCase() === 'user' && message.outboundStatus === 'pending',
    );
    if (pendingMessages.length === 0) {
      return;
    }

    const recoverIfStuck = () => {
      if (isSendingRef.current || activeChatStreamRef.current) {
        return;
      }
      const stuckIds = findStuckPendingOutboundIds(messagesRef.current, Date.now(), {
        isSending: isSendingRef.current,
        streamInFlight: activeChatStreamRef.current,
      });
      if (stuckIds.length === 0) {
        return;
      }
      commitMessages((prev) =>
        applyStuckOutboundRecovery(prev, stuckIds, OUTBOUND_STUCK_FAILURE_REASON),
      );
      const stuckMessage = messagesRef.current.find(
        (message) => message.id && stuckIds.includes(message.id),
      );
      if (stuckMessage?.content?.trim()) {
        lastFailedSendTextRef.current = stuckMessage.content.trim();
      }
      pendingOutboundSendsRef.current = 0;
      setPinnedOutboundStatus('failed');
      setPinnedOutboundText(null);
      setRunProgress((prev) =>
        prev && prev.phase !== 'completed' && prev.phase !== 'failed'
          ? { ...prev, phase: 'failed', detail: OUTBOUND_STUCK_FAILURE_REASON }
          : prev,
      );
      haptics.warning();
    };

    const now = Date.now();
    let delayMs = OUTBOUND_PENDING_RECOVERY_MS;
    for (const message of pendingMessages) {
      const created = Date.parse(message.created_at ?? '');
      if (!Number.isFinite(created)) {
        delayMs = 5_000;
        break;
      }
      delayMs = Math.min(delayMs, Math.max(0, created + OUTBOUND_PENDING_RECOVERY_MS - now));
    }

    const timer = setTimeout(recoverIfStuck, delayMs);
    return () => clearTimeout(timer);
  }, [commitMessages, isDemo, isSending, messages, setRunProgress]);

  useEffect(() => {
    return () => {
      setChatStreamProgressActive(false);
    };
  }, [setChatStreamProgressActive]);

  useEffect(() => {
    clearDeferredTelegramPoll();
  }, [currentSession?.id, clearDeferredTelegramPoll]);

  const handleInputFocus = useCallback(() => {
    inputFocusedRef.current = true;
    if (Platform.OS === 'android') {
      setComposerLayoutNonce((n) => n + 1);
    }
  }, []);

  const handleInputBlur = useCallback(() => {
    inputFocusedRef.current = false;
    if (pendingTranscriptSyncRef.current) {
      pendingTranscriptSyncRef.current = false;
      void refreshSessionMessages({ background: true });
    }
  }, [refreshSessionMessages]);

  useEffect(() => {
    setUndoSecondsLeft(0);
    if (pendingOutboundSendsRef.current === 0 && !isSendingRef.current) {
      setPinnedOutboundText(null);
      setPinnedOutboundStatus('pending');
    }
    if (pendingOutboundSendsRef.current > 0 || isSendingRef.current) {
      return;
    }
    setRunProgress(null);
    transcriptDigestRef.current = '';
    void refreshSessionMessagesRef.current?.({ background: true });
  }, [currentSession?.id, isDemo, setRunProgress]);

  useFocusEffect(
    useCallback(() => {
      const activeSession = currentSessionRef.current;
      if (!activeSession || isDemo || !macChatLive) {
        return;
      }
      if (!macHttpOk && connectionState !== 'connected' && connectionState !== 'demo') {
        connectEvents();
      }
      if (!isLoadingMessagesRef.current && !isPullRefreshingRef.current) {
        refreshSessionMessagesRef.current?.({ background: true });
      }
    }, [
      currentSession?.id,
      isDemo,
      macChatLive,
      macHttpOk,
      connectionState,
      connectEvents,
    ]),
  );

  useEffect(() => {
    const activeSession = currentSessionRef.current;
    if (!activeSession || isDemo || !macChatLive) {
      return;
    }
    if (transcriptSyncTimerRef.current) {
      clearTimeout(transcriptSyncTimerRef.current);
    }
    transcriptSyncTimerRef.current = setTimeout(() => {
      transcriptSyncTimerRef.current = null;
      void refreshSessionMessagesRef.current?.({ background: true });
    }, 1500);
    return () => {
      if (transcriptSyncTimerRef.current) {
        clearTimeout(transcriptSyncTimerRef.current);
        transcriptSyncTimerRef.current = null;
      }
    };
  }, [transcriptSyncNonce, currentSession?.id, isDemo, macChatLive]);

  // Background HTTP polling when WebSocket is down, or for gateway-backed threads (every 4–5s).
  useEffect(() => {
    const activeSession = currentSessionRef.current;
    if (!activeSession || isDemo || !macChatLive) {
      return;
    }
    // We poll if:
    // 1. Gateway-backed thread view (4–5s)
    // 2. WebSocket is down (8s HTTP fallback for all sessions)
    const shouldPoll = isTelegramView || connectionState !== 'connected';
    if (!shouldPoll) {
      return;
    }
    const intervalMs =
      isTelegramView ? (connectionState === 'connected' ? 5000 : 4000) : connectionState === 'connected' ? 12000 : 8000;
    const timer = setInterval(() => {
      refreshSessionMessagesRef.current?.({ background: true });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [currentSession?.id, isDemo, macChatLive, isTelegramView, connectionState]);

  useEffect(() => {
    const activeSession = currentSessionRef.current;
    if (!activeSession || isDemo || !macChatLive) {
      return;
    }
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshSessionMessagesRef.current?.({ background: true });
      }
    });
    return () => sub.remove();
  }, [currentSession?.id, isDemo, macChatLive]);

  useEffect(() => {
    const activeSession = currentSessionRef.current;
    if (!activeSession || isDemo || !macChatLive) {
      return;
    }
    if (!isSending && !runProgress) {
      return;
    }
    // Live WebSocket already pushes TRANSCRIPT.UPDATED; HTTP poll is fallback only.
    if (connectionState === 'connected') {
      return;
    }
    const timer = setInterval(() => {
      refreshSessionMessagesRef.current?.({ background: true });
    }, 4_000);
    return () => clearInterval(timer);
  }, [currentSession?.id, isDemo, macChatLive, isSending, runProgress, connectionState]);

  const handleMacRetry = useCallback(async () => {
    if (macRetryBusy || isDemo) {
      return;
    }
    haptics.selection();
    setMacRetryBusy(true);
    setRunProgress(null);
    setPinnedOutboundText(null);
    setPinnedOutboundStatus('pending');
    setErrorMessage((prev) => (prev && isConnectivityMessage(prev) ? null : prev));

    try {
      let nextSettings = settings;
      if (settings.connectionMode !== 'gateway') {
        nextSettings = { ...settings, connectionMode: 'gateway' as const };
        await saveSettings(nextSettings, apiKey);
      }



      await scanForGatewayProfiles();
      await autoConnectGateway();
      await retryGatewayBootstrap();
      await refreshHealth();
      connectEvents();

      const retryText = lastFailedSendTextRef.current?.trim();
      if (retryText) {
        await sendUserTextRef.current(retryText, true);
      }
    } catch (err) {
      console.warn('[handleMacRetry] failed:', err);
      setErrorMessage(
        `Still can't reach ${machineShortLabel}. Check USB cable or same Wi‑Fi, then tap to retry again.`,
      );
      haptics.warning();
    } finally {
      setMacRetryBusy(false);
    }
  }, [
    macRetryBusy,
    isDemo,
    settings,
    apiKey,
    saveSettings,
    gatewayProfiles,
    activeGatewayProfile?.id,
    effectiveGatewayUrl,
    selectGatewayProfile,
    scanForGatewayProfiles,
    autoConnectGateway,
    retryGatewayBootstrap,
    refreshHealth,
    connectEvents,
    machineShortLabel,
  ]);

  const handleManualSync = useCallback(async () => {
    if (!currentSession || isDemo || !macChatLive || isPullRefreshing) {
      return;
    }
    haptics.light();
    const stickToBottom = userNearBottomRef.current || isSending;
    await refreshSessionMessages({ manual: true });
    if (stickToBottom) {
      requestAnimationFrame(() => scrollChatToLatest(true));
    }
  }, [
    currentSession,
    isDemo,
    macChatLive,
    isPullRefreshing,
    isSending,
    refreshSessionMessages,
    scrollChatToLatest,
  ]);

  useEffect(() => {
    if (inputFocusedRef.current || isLoadingMessages) {
      return;
    }
    userNearBottomRef.current = true;
    scrollChatToLatest(false);
    const retryTimer = setTimeout(() => scrollChatToLatest(false), 200);
    return () => clearTimeout(retryTimer);
  }, [currentSession?.id, isLoadingMessages, scrollChatToLatest]);

  useEffect(() => {
    if (inputFocusedRef.current || !isSending || isLoadingMessages || messages.length === 0) {
      return;
    }
    scrollChatToLatest(true);
  }, [messages, isSending, isLoadingMessages, scrollChatToLatest]);

  const handleNewChat = async () => {
    haptics.selection();
    setSessionModalVisible(false);
    setRecentChatsDismissed(true);
    setErrorMessage(null);
    setMessages([]);
    setPinnedOutboundText(null);
    setPinnedOutboundStatus('pending');
    setTelegramReplySessionId('');
    transcriptDigestRef.current = '';
    setToolStatus(null);
    setRunProgress(null);
    skipSessionAutoSelectRef.current = true;
    setComposerFocusNonce((n) => n + 1);
    inputValueRef.current = '';
    setInputValue('');

    if (isDemo) {
      const sessionTitle = activeProject
        ? `${activeProject.name} — ${new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
        : `Session #${sessions.length + 1}`;
      const newSess: HermesSession = {
        id: `demo-${Date.now()}`,
        title: sessionTitle,
        last_active_at: new Date().toISOString(),
      };
      setSessions((prev) => [newSess, ...prev]);
      setCurrentSession(newSess);
      if (activeProject) {
        const next = bindSessionToProject(
          projectState,
          activeProject.id,
          newSess.id,
          sessionTitle,
        );
        await persistProjectState(next);
      } else {
        const next = pinSessionLabel(projectState, newSess.id, sessionTitle);
        await persistProjectState(next);
      }
      return;
    }

    // Live: compose first — create the Mac session when the user sends (avoids gateway
    // "session already in use" when the operator slot is still bound to the prior thread).
    setCurrentSession(null);
  };

  const executeClearAllChats = useCallback(async () => {
    haptics.warning();
    setIsClearing(true);

    try {
      if (isDemo) {
        // Mock a brief delay for clearing in demo mode so the UI actually updates
        await new Promise((resolve) => setTimeout(resolve, 50));
        deletedDemoSessionIdsRef.current.add('demo-1');
        deletedDemoSessionIdsRef.current.add('demo-2');
        setSessions([]);
        
        // Wipe local project state bindings
        const nextState = clearAllSessionBindings(projectState);
        await persistProjectState(nextState);
        
        await handleNewChat();
        return;
      }

      const deletable = sessionsRef.current.filter((session) => !isTelegramInboxSession(session));
      const attemptedIds = deletable.map((session) => session.id);
      const hideCronAfterClear = deletable.some((session) => isAutomatedCronSession(session));
      const effectiveHideCron = hideCronAfterClear || hideCronSessionsRef.current;
      dismissedHydrationGenRef.current += 1;
      const nextDismissed = [...new Set([...dismissedSessionIdsRef.current, ...attemptedIds])];

      let failed = 0;
      for (const session of deletable) {
        try {
          await deleteSession(gatewayUrl, session.id, apiKey);
        } catch {
          failed += 1;
        }
      }

      if (attemptedIds.length > 0) {
        await storage.addDismissedSessionIds(gatewayUrl, attemptedIds);
      }

      if (hideCronAfterClear) {
        await storage.setHideCronSessions(gatewayUrl, true);
        setHideCronSessions(true);
      }

      setDismissedSessionIds(nextDismissed);

      const applyClearedFilter = (list: HermesSession[]) =>
        filterDismissedThreadSessions(list, {
          dismissedSessionIds: nextDismissed,
          hideCronSessions: effectiveHideCron,
        });

      setSessions((prev) => applyClearedFilter(prev));

      const nextState = clearAllSessionBindings(projectState);
      await persistProjectState(nextState);

      await loadSessionsList(true);

      dismissedHydrationGenRef.current += 1;
      setDismissedSessionIds(nextDismissed);
      setSessions((prev) => applyClearedFilter(prev));
      if (failed > 0) {
        setErrorMessage(
          `${failed} thread${failed === 1 ? '' : 's'} could not be deleted on your Mac. The rest were cleared.`,
        );
      } else {
        setErrorMessage(null);
      }
      await handleNewChat();
    } finally {
      setIsClearing(false);
      setSessionModalVisible(false);
    }
  }, [apiKey, gatewayUrl, handleNewChat, isDemo, loadSessionsList, projectState, persistProjectState]);

  const handleClearAllChats = useCallback(() => {
    Alert.alert(
      'Clear all chats?',
      'This deletes every thread on your Mac from Hermes. You cannot undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear all', style: 'destructive', onPress: () => void executeClearAllChats() },
      ],
    );
  }, [executeClearAllChats]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    Alert.alert(
      'Delete thread?',
      'This deletes the thread. You cannot undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!isDemo) {
              let apiDeleted = false;
              try {
                await deleteSession(gatewayUrl, sessionId, apiKey);
                apiDeleted = true;
              } catch (err) {
                console.warn('[handleDeleteSession] API delete failed:', err);
                await storage.addDismissedSessionIds(gatewayUrl, [sessionId]);
                setDismissedSessionIds((prev) => [...new Set([...prev, sessionId])]);
              }
              if (apiDeleted) {
                await storage.removeDismissedSessionIds(gatewayUrl, [sessionId]);
              }
            } else {
              deletedDemoSessionIdsRef.current.add(sessionId);
            }
            const nextState = clearBoundSessions(projectState, [sessionId]);
            await persistProjectState(nextState);
            
            if (currentSession?.id === sessionId) {
              const activeProj = nextState.projects.find((p) => p.id === nextState.activeProjectId);
              const nextActiveId = activeProj?.activeSessionId;
              if (nextActiveId) {
                const found = sessions.find((s) => s.id === nextActiveId);
                setCurrentSession(found || null);
              } else {
                setCurrentSession(null);
              }
            }
            await loadSessionsList(true);
          },
        },
      ]
    );
  }, [apiKey, gatewayUrl, isDemo, projectState, persistProjectState, currentSession, sessions, loadSessionsList]);

  const handleRenameSession = useCallback((sessionId: string, currentTitle: string) => {
    setRenameSessionId(sessionId);
    setRenameValue(currentTitle);
    setRenameModalVisible(true);
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!renameSessionId || !renameValue.trim()) {
      return;
    }
    const label = renameValue.trim();
    const nextState = pinSessionLabel(projectState, renameSessionId, label);
    await persistProjectState(nextState);
    
    setRenameModalVisible(false);
    setRenameSessionId(null);
    setRenameValue('');
    await loadSessionsList(true);
  }, [renameSessionId, renameValue, projectState, persistProjectState, loadSessionsList]);

  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;

  const handleComposerTextChange = useCallback((text: string) => {
    if (
      sendClearSuppressRef.current &&
      normalizeMessageText(text) === normalizeMessageText(lastSentComposerTextRef.current)
    ) {
      return;
    }
    sendClearSuppressRef.current = false;
    inputValueRef.current = text;
    setInputValue(text);
  }, []);

  const handleSendMessage = async () => {
    const userText = inputValueRef.current.trim();
    if (!userText) return;

    lastSentComposerTextRef.current = userText;
    sendClearSuppressRef.current = true;
    inputValueRef.current = '';
    setInputValue('');
    Keyboard.dismiss();

    const accepted = await sendUserText(userText);
    if (!accepted) {
      sendClearSuppressRef.current = false;
      lastSentComposerTextRef.current = '';
      inputValueRef.current = userText;
      setInputValue(userText);
    } else {
      haptics.light();
    }
  };

  const handleSendMessageRef = useRef(handleSendMessage);
  handleSendMessageRef.current = handleSendMessage;

  const handleSubmit = useCallback(() => {
    if (inputValueRef.current.trim()) {
      void handleSendMessageRef.current();
    }
  }, []);

  const handleSend = useCallback(() => {
    void handleSendMessageRef.current();
  }, []);

  const drainOutboundQueue = () => {
    const next = outboundQueueRef.current.shift();
    setQueuedOutboundCount(outboundQueueRef.current.length);
    if (next) {
      queueMicrotask(() => sendUserText(next, true));
    }
  };

  const startApprovalUndoWindow = () => {
    setUndoSecondsLeft(8);
  };

  const markTextNudgeResolved = (textApproval: ChatTextApproval) => {
    const key = nudgeResolutionKey(textApproval);
    setResolvedApprovalKeys((prev) => {
      if (prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const resolveHermesApproval = async (
    choice: ApprovalChoice,
    request: HermesApprovalRequest,
    textApproval?: ChatTextApproval,
  ) => {
    if (request.source === 'gateway_guard' && request.runId) {
      const leashMatch = pendingApprovals.find(
        (p) => p.runId === request.runId || p.actionId === request.runId,
      );
      if (leashMatch) {
        await submitApprovalChoice(leashMatch.actionId, choice, leashMatch);
      } else {
        await resolveApprovalChoice(request, choice, {
          gatewayUrl,
          apiKey,
          sendGateAction,
          sendChatText: async (text) => {
            await sendUserText(text, true);
          },
        });
      }
      setPendingRunApproval(null);
      if (choice !== 'deny') {
        startApprovalUndoWindow();
      }
      haptics.success();
      return;
    }

    await resolveApprovalChoice(request, choice, {
      gatewayUrl,
      apiKey,
      sendGateAction,
      sendChatText: async (text) => {
        await sendUserText(text, true);
      },
    });

    if (request.source === 'text_nudge') {
      if (textApproval) {
        markTextNudgeResolved(textApproval);
      }
      if (choice !== 'deny') {
        startApprovalUndoWindow();
      }
    }
    if (request.source === 'gateway_guard') {
      setPendingRunApproval(null);
    }
  };

  const findTextApprovalForRequest = (
    request: HermesApprovalRequest,
  ): ChatTextApproval | undefined => {
    if (!request.approveText) {
      return undefined;
    }
    const phrase = request.approveText.trim().toUpperCase();
    for (const inline of inlineTextApprovals.values()) {
      if (inline.approveText.trim().toUpperCase() === phrase) {
        return inline;
      }
    }
    return listAllPendingTextApprovals(messages, resolvedApprovalKeys, leashPhraseHints).find(
      (item) => item.approveText.trim().toUpperCase() === phrase,
    );
  };

  const handleApprovalChoice = async (
    choice: ApprovalChoice,
    explicitRequest?: HermesApprovalRequest,
    textApproval?: ChatTextApproval,
  ) => {
    const request = explicitRequest ?? composerApprovalQueue[0];
    if (!request || approvalBusy || isSending) return;
    haptics.light();
    setApprovalBusy(true);
    try {
      const resolvedText =
        textApproval ?? (request.source === 'text_nudge' ? findTextApprovalForRequest(request) : undefined);
      await resolveHermesApproval(choice, request, resolvedText);
    } catch (err) {
      applyChatApiError(err, 'Approval could not reach your computer.');
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleInlineTextApproval = useCallback(
    (textApproval: ChatTextApproval, choice: ApprovalChoice) => {
      const request = enrichApprovalRequest(
        fromChatTextApproval(textApproval),
        settings.approvalPolicy,
      );
      handleApprovalChoice(choice, request, textApproval);
    },
    [settings.approvalPolicy, handleApprovalChoice],
  );

  const handleShowMessageDetail = useCallback((body: string, isUser: boolean) => {
    setMessageDetail({
      title: isUser ? 'Your message' : 'Message detail',
      body,
    });
  }, []);

  const leashUnlocked = isThumbgateLeashUnlocked(settings);

  const submitChatOutputFeedbackForMessage = useCallback(
    async (message: HermesMessage, signal: 'up' | 'down', explanation?: string) => {
      await submitChatOutputFeedback(message, signal, {
        session: currentSession,
        explanation,
      });
    },
    [currentSession, submitChatOutputFeedback],
  );

  const handleChatOutputFeedbackTap = useCallback(
    (message: HermesMessage, signal: 'up' | 'down') => {
      void submitChatOutputFeedbackForMessage(message, signal);
      setFeedbackPrompt({ message, signal });
    },
    [submitChatOutputFeedbackForMessage],
  );

  // The thumbs vote ALWAYS records (the modal copy promises "we saved your thumbs up");
  // the explanation is optional, so Skip / dismiss still logs the bare signal.
  const resolveFeedbackPrompt = useCallback(
    (explanation?: string) => {
      if (feedbackPrompt) {
        void submitChatOutputFeedbackForMessage(
          feedbackPrompt.message,
          feedbackPrompt.signal,
          explanation?.trim() || undefined,
        );
      }
      setFeedbackPrompt(null);
    },
    [feedbackPrompt, submitChatOutputFeedbackForMessage],
  );

  const isTelegramInbox = isTelegramInboxSession(currentSession);

  const renderChatMessageItem = useCallback(
    ({ item, index }: { item: HermesMessage; index: number }) => {
      const inlineNudge = inlineTextApprovals.get(index);
      const isStreamingAssistant =
        isSending &&
        item.role?.toLowerCase() === 'assistant' &&
        index === messages.length - 1;
      const showOutputFeedback = shouldShowChatOutputFeedback(item, {
        leashUnlocked,
        isStreamingAssistant,
      });
      const busyKey = resolveChatOutputFeedbackBusyKey(item);
      const outputFeedback = showOutputFeedback
        ? {
            busy: chatOutputFeedbackBusyId === busyKey,
            onThumbsUp: () => handleChatOutputFeedbackTap(item, 'up'),
            onThumbsDown: () => handleChatOutputFeedbackTap(item, 'down'),
          }
        : undefined;
      return (
        <ChatMessageListItem
          item={item}
          listIndex={index}
          originalIndex={index}
          messages={messages}
          timeLabel={formatMessageTimestamp(item.created_at ?? item.timestamp)}
          inlineNudge={inlineNudge}
          includeToolActivity={settings.includeToolActivity ?? false}
          isTelegramInbox={isTelegramInbox}
          connectionState={connectionState}
          macHttpOk={macHttpOk}
          approvalBusy={approvalBusy}
          isSending={isSending}
          outputFeedback={outputFeedback}
          onShowDetail={handleShowMessageDetail}
          onInlineTextApproval={handleInlineTextApproval}
        />
      );
    },
    [
      messages,
      inlineTextApprovals,
      settings.includeToolActivity,
      isTelegramInbox,
      connectionState,
      macHttpOk,
      approvalBusy,
      isSending,
      leashUnlocked,
      chatOutputFeedbackBusyId,
      handleChatOutputFeedbackTap,
      handleShowMessageDetail,
      handleInlineTextApproval,
    ],
  );

  const handleApprovalEdit = (approval: HermesApprovalRequest) => {
    const seed =
      approval.command ||
      approval.title ||
      approval.approveText ||
      '';
    setInputValue(`${CHAT_APPROVAL_EDIT_PREFIX}${seed}`);
    haptics.selection();
  };

  const handleChatApprovalUndo = async () => {
    if (undoSecondsLeft <= 0 || isSending) return;
    setUndoSecondsLeft(0);
    await sendUserText(CHAT_APPROVAL_UNDO_TEXT, true);
  };

  const commitOutboundUserBubble = (text: string): string => {
    const trimmed = text.trim();
    outboundMessageSeqRef.current += 1;
    const userMessage: HermesMessage = {
      id: `user-${Date.now()}-${outboundMessageSeqRef.current}`,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
      outboundStatus: 'pending',
    };
    pendingOutboundSendsRef.current += 1;
    commitMessages((prev) => [...prev, userMessage]);
    setPinnedOutboundText(trimmed);
    setPinnedOutboundStatus('pending');
    setToolStatus(null);
    scrollChatToLatest(true);
    return userMessage.id ?? '';
  };

  async function sendUserText(userText: string, isProgrammatic = false): Promise<boolean> {
    if (!userText.trim()) return false;

    if (isSendingRef.current) {
      const trimmed = userText.trim();
      outboundQueueRef.current.push(trimmed);
      setQueuedOutboundCount(outboundQueueRef.current.length);
      commitOutboundUserBubble(trimmed);
      if (!isProgrammatic) {
        haptics.light();
      }
      return true;
    }

    isSendingRef.current = true;
    setIsSending(true);

    let outboundLockReleased = false;
    const releaseOutboundSendLock = () => {
      if (outboundLockReleased) {
        return;
      }
      outboundLockReleased = true;
      isSendingRef.current = false;
      setIsSending(false);
      drainOutboundQueue();
    };

    const collectRecoveryRunIds = (): string[] => {
      const ids = [
        runProgress?.runId,
        runProgressRef.current?.runId,
        sendProgressSnapshotRef.current?.runId,
      ];
      return [...new Set(ids.filter((id): id is string => Boolean(id?.trim())))];
    };

    const notifyWaitingForMacSlot = () => {
      setRunProgress((prev) =>
        prev
          ? { ...prev, detail: 'Waiting for your Mac to finish the previous chat…' }
          : {
              phase: 'sending',
              startedAtMs: Date.now(),
              detail: 'Waiting for your Mac to finish the previous chat…',
            },
      );
    };

    const typed = userText.trim();
    const typedUpper = typed.toUpperCase();

    const approvalUiVisibleForPhrase = (phrase: string): boolean => {
      const upper = phrase.trim().toUpperCase();
      for (const inline of inlineTextApprovals.values()) {
        if (inline.approveText.trim().toUpperCase() === upper) {
          return true;
        }
      }
      for (const request of composerApprovals) {
        if (request.approveText?.trim().toUpperCase() === upper) {
          return true;
        }
      }
      return false;
    };

    if (!isProgrammatic) {
      for (const textApproval of inlineTextApprovals.values()) {
        const phrase = textApproval.approveText.trim().toUpperCase();
        if (typedUpper === phrase || typedUpper.includes(phrase)) {
          if (approvalUiVisibleForPhrase(phrase)) {
            setErrorMessage('Tap Approve on the card below — typing approval phrases is not required.');
            haptics.warning();
            isSendingRef.current = false;
            setIsSending(false);
            outboundLockReleased = true;
            return false;
          }
        }
      }
      for (const request of composerApprovals) {
        const phrase = request.approveText?.trim().toUpperCase();
        if (!phrase) {
          continue;
        }
        if (typedUpper === phrase || typedUpper.includes(phrase)) {
          if (approvalUiVisibleForPhrase(phrase)) {
            setErrorMessage('Tap Approve on the card below — typing approval phrases is not required.');
            haptics.warning();
            isSendingRef.current = false;
            setIsSending(false);
            outboundLockReleased = true;
            return false;
          }
        }
      }
    }

    if (!isDemo && !macChatLive) {
      const blockedMessage = chatSendBlockedMessage({
        connectionMode: settings.connectionMode,
        connectionState,
        gatewayUrl,
        healthProbePending,
      });
      setErrorMessage(blockedMessage);
      haptics.warning();
      isSendingRef.current = false;
      setIsSending(false);
      outboundLockReleased = true;
      return false;
    }

    let outboundUserBubbleCommitted = false;
    let committedUserMessageId: string | null = null;

    const rollbackOutboundBubble = () => {
      if (!outboundUserBubbleCommitted || !committedUserMessageId) {
        return;
      }
      const failedId = committedUserMessageId;
      commitMessages((prev) =>
        prev.map((message) =>
          message.id === failedId ? { ...message, outboundStatus: 'failed' } : message,
        ),
      );
      if (pendingOutboundSendsRef.current > 0) {
        pendingOutboundSendsRef.current -= 1;
      }
      setPinnedOutboundStatus('failed');
      setPinnedOutboundText(null);
      outboundUserBubbleCommitted = false;
      committedUserMessageId = null;
    };

    committedUserMessageId = commitOutboundUserBubble(typed);
    outboundUserBubbleCommitted = true;

    let activeSess = currentSession;
    if (!activeSess) {
      if (isDemo) {
        activeSess = {
          id: `demo-${Date.now()}`,
          title: 'Auto-created session',
          last_active_at: new Date().toISOString(),
        };
        setSessions([activeSess]);
        setCurrentSession(activeSess);
      } else {
        const title = activeProject?.name ?? 'New mobile session';
        await releaseMacOperatorSlot(gatewayUrl, apiKey, collectRecoveryRunIds());
        try {
          activeSess = await retryOnSessionInUse(
            gatewayUrl,
            apiKey,
            collectRecoveryRunIds(),
            () => createSession(gatewayUrl, apiKey, title, mobileChatSystemPrompt),
            notifyWaitingForMacSlot,
          );
        } catch (err) {
          if (isSessionInUseError(err)) {
            const forkSource = sessionsRef.current.find((session) => !isTelegramInboxSession(session));
            if (forkSource) {
              try {
                const forked = await forkSession(gatewayUrl, forkSource.id, apiKey);
                const forkId = forked.session_id?.trim();
                if (forkId) {
                  activeSess = {
                    id: forkId,
                    title,
                    last_active_at: new Date().toISOString(),
                  };
                }
              } catch {
                // fall through
              }
            }
          }
          if (!activeSess) {
            rollbackOutboundBubble();
            applyChatApiError(err, 'Could not start chat on your computer.');
            releaseOutboundSendLock();
            return false;
          }
        }
        setSessions((prev) => [activeSess!, ...prev.filter((session) => session.id !== activeSess!.id)]);
        setCurrentSession(activeSess);
        if (activeProject) {
          const next = bindSessionToProject(
            projectState,
            activeProject.id,
            activeSess.id,
            title,
          );
          await persistProjectState(next);
        } else {
          const next = pinSessionLabel(projectState, activeSess.id, title);
          await persistProjectState(next);
        }
      }
    }

    sendStartedAtRef.current = Date.now();

    let inboxReplySessionId = telegramReplySessionId;
    if (isTelegramInboxSession(activeSess) && !inboxReplySessionId) {
      inboxReplySessionId = resolveTelegramInboxReplySessionId(sessionsRef.current);
      if (inboxReplySessionId) {
        setTelegramReplySessionId(inboxReplySessionId);
      }
    }

    const targetSessionIdForProgress = isTelegramInboxSession(activeSess)
      ? inboxReplySessionId
      : activeSess!.id;
    setRunProgress((prev) =>
      mergeSessionUsageIntoRunProgress(
        prev
          ? { ...prev, sessionId: targetSessionIdForProgress ?? prev.sessionId }
          : {
              phase: 'sending',
              startedAtMs: sendStartedAtRef.current,
              detail: 'Delivering your message…',
              sessionId: targetSessionIdForProgress,
            },
        activeSess!,
        'Delivering your message…',
      ),
    );

    const markOutboundBubbleStatus = (status: 'sent' | 'failed', failureReason?: string) => {
      if (!committedUserMessageId) {
        return;
      }
      setPinnedOutboundStatus(status);
      if (status === 'failed') {
        setPinnedOutboundText(null);
      }
      commitMessages((prev) =>
        prev.map((message) =>
          message.id === committedUserMessageId
            ? {
                ...message,
                outboundStatus: status,
                outboundFailureReason: status === 'failed' ? failureReason : undefined,
              }
            : message,
        ),
      );
    };

    const markMessageDeliveredToMac = () => {
      if (
        !isGatewayLiveForDelivery({
          connectionState,
          macHttpOk,
        })
      ) {
        return;
      }
      markOutboundBubbleStatus('sent');
      setRunProgress((prev) =>
        prev
          ? {
              ...prev,
              phase: 'working',
              detail: 'Hermes is working on your Mac…',
            }
          : prev,
      );
    };

    if (isDemo) {
      releaseOutboundSendLock();
      setRunProgress((prev) =>
        prev
          ? {
              ...prev,
              phase: 'working',
              detail: 'Hermes is working on your Mac…',
            }
          : {
              phase: 'working',
              startedAtMs: sendStartedAtRef.current,
              detail: 'Hermes is working on your Mac…',
              sessionId: targetSessionIdForProgress,
            },
      );
      setTimeout(() => {
        markOutboundBubbleStatus('sent');
        const assistantText = `[Demo Mode] I received: "${userText}". Since the gateway is in demo mode, I'm providing a mock reply. Let me know if you want to test live controls!`;
        const assistantMessage: HermesMessage = {
          role: 'assistant',
          content: assistantText,
          created_at: new Date().toISOString(),
        };
        commitMessages((prev) => [...prev, assistantMessage]);
        setRunProgress(null);
        haptics.success();
      }, 1500);
      return true;
    }

    let targetSessionId = isTelegramInboxSession(activeSess) ? inboxReplySessionId : activeSess!.id;
    if (isTelegramInboxSession(activeSess) && !targetSessionId) {
      const resolved = resolveTelegramInboxReplySessionId(sessionsRef.current);
      if (resolved) {
        targetSessionId = resolved;
        setTelegramReplySessionId(resolved);
      }
    }
    if (isTelegramInboxSession(activeSess) && !targetSessionId) {
      try {
        const title = activeProject?.name ?? 'New mobile session';
        const mobileSess = await createSession(
          gatewayUrl,
          apiKey,
          title,
          mobileChatSystemPrompt,
        );
        setSessions((prev) => [mobileSess, ...prev.filter((s) => s.id !== mobileSess.id)]);
        setCurrentSession(mobileSess);
        setTelegramReplySessionId('');
        activeSess = mobileSess;
        targetSessionId = mobileSess.id;
        setErrorMessage(null);
      } catch (err) {
        rollbackOutboundBubble();
        setErrorMessage(
          'No Hermes thread is ready on this view. Pick a chat session from the dropdown, or start a new mobile session.',
        );
        applyChatApiError(err, 'Could not start a new chat on your computer.');
        releaseOutboundSendLock();
        return false;
      }
    }

    let sendSucceeded = false;
    let sendFailureDetail: string | null = null;

    try {
      activeChatStreamRef.current = true;
      const assistantId = `asst-${Date.now()}`;
      activeAssistantIdRef.current = assistantId;
      activeAssistantTextRef.current = '';
      let assistantBubbleAdded = false;
      const priorAssistants = snapshotAssistantBodies(messagesRef.current);

      const updateAssistant = (text: string) => {
        const body = text.trim();
        if (!body) {
          return;
        }
        if (!assistantBubbleAdded) {
          assistantBubbleAdded = true;
          commitMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: 'assistant',
              content: body,
              created_at: new Date().toISOString(),
            },
          ]);
          return;
        }
        commitMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: body } : m)),
        );
      };

      let switchedSessionId = targetSessionId;
      let assistantText = '';
      try {
        assistantText = await retryOnSessionInUse(
          gatewayUrl,
          apiKey,
          collectRecoveryRunIds(),
          () =>
            streamSessionChat(
          gatewayUrl,
          targetSessionId,
          userText,
          apiKey,
          (evt) => {
            const rawSessionId = evt.data?.session_id;
            const streamSessionId = typeof rawSessionId === 'string' ? rawSessionId : '';
            if (streamSessionId && streamSessionId !== switchedSessionId) {
              switchedSessionId = streamSessionId;
              if (isTelegramInboxSession(activeSess)) {
                setTelegramReplySessionId(streamSessionId);
                void loadSessionsList(false, { silent: true }).then(() => {
                  void refreshSessionMessagesRef.current?.({ background: true });
                });
              } else {
                const match = sessionsRef.current.find((s) => s.id === streamSessionId);
                if (match) {
                  setCurrentSession(match);
                } else {
                  void loadSessionsList(false, { silent: true }).then(() => {
                    const updatedMatch = sessionsRef.current.find((s) => s.id === streamSessionId);
                    if (updatedMatch) {
                      setCurrentSession(updatedMatch);
                    } else {
                      setCurrentSession({
                        id: streamSessionId,
                        source: 'telegram',
                        last_active_at: new Date().toISOString(),
                      });
                    }
                  });
                }
              }
            }

            const eventName = String(evt.event ?? '').toLowerCase();
            if (
              eventName === 'run.completed' ||
              eventName === 'done' ||
              eventName === 'run.failed' ||
              eventName === 'error'
            ) {
              const failed = eventName === 'run.failed' || eventName === 'error';
              setRunProgress((prev) => {
                if (!prev) {
                  return prev;
                }
                return mergeRunUsageFromPayload(
                  {
                    ...prev,
                    phase: failed ? 'failed' : 'completed',
                    detail: failed
                      ? String(evt.data?.error || 'Run ended with error')
                      : 'Task completed',
                  },
                  evt.data,
                );
              });
              if (!failed) {
                setOperatorTerminalLine(null);
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
              if (eventName.startsWith('tool.')) {
                const toolName =
                  typeof evt.data.tool === 'string'
                    ? evt.data.tool
                    : typeof evt.data.tool_name === 'string'
                      ? evt.data.tool_name
                      : '';
                const preview =
                  typeof evt.data.preview === 'string'
                    ? evt.data.preview
                    : typeof evt.data.command === 'string'
                      ? evt.data.command
                      : '';
                if (toolName && preview && isTerminalToolName(toolName)) {
                  setOperatorTerminalLine({ toolName, text: preview.slice(0, 400) });
                }
              }
              setRunProgress((prev) => {
                const dummyState = { runProgress: prev, toolCalls: [] };
                const nextState = applyStreamEvent(dummyState, evt);
                const next = nextState.runProgress;
                if (!next) {
                  return prev;
                }
                if (runProgressForDisplayEqual(prev, next)) {
                  return prev;
                }
                return next;
              });
            }

            if (evt.event === 'assistant.delta' && typeof evt.data.delta === 'string') {
              assistantText += evt.data.delta;
              updateAssistant(assistantText);
            }
            if (evt.event === 'run.completed' || evt.event === 'done') {
              const fromTranscript = extractAssistantFromRunCompletedPayload(evt.data);
              if (fromTranscript) {
                assistantText = fromTranscript;
                updateAssistant(fromTranscript);
              }
            }
            if (typeof evt.event === 'string' && evt.event.startsWith('tool.') && evt.data.tool_name) {
              setToolStatus(null);
            }
            if (evt.event === 'approval.request') {
              const parsed = fromApprovalRequestEvent(evt.data);
              if (parsed) {
                setPendingRunApproval({
                  kind: 'run',
                  runId: parsed.runId!,
                  command: parsed.command,
                  description: parsed.reason,
                  allowPermanent: parsed.allowPermanent,
                });
              }
            }
            if (evt.event === 'run.completed' || evt.event === 'done') {
              setPendingRunApproval(null);
            }
          },
          mobileChatSystemPrompt,
          () => {
            markMessageDeliveredToMac();
            releaseOutboundSendLock();
            setRunProgress((prev) =>
              prev
                ? {
                    ...prev,
                    phase: 'working',
                    detail: 'Hermes is working on your Mac…',
                  }
                : prev,
            );
          },
        ),
          notifyWaitingForMacSlot,
        );
      } catch (streamErr) {
        const streamMessage =
          streamErr instanceof Error ? streamErr.message : String(streamErr);
        const streamStatus =
          streamErr instanceof HermesGatewayApiError ? streamErr.status : 0;
        const shouldFallback =
          isSessionInUseError(streamErr) ||
          streamStatus >= 400 ||
          streamMessage.includes('Network request failed') ||
          streamMessage.includes('Failed to fetch') ||
          streamMessage.toLowerCase().includes('timed out') ||
          streamMessage.toLowerCase().includes('stalled') ||
          streamMessage.includes('AbortError') ||
          streamMessage.toLowerCase().includes('connection error');

        if (shouldFallback) {
          const response = await retryOnSessionInUse(
            gatewayUrl,
            apiKey,
            collectRecoveryRunIds(),
            () =>
              sendChatMessage(
                gatewayUrl,
                targetSessionId,
                userText,
                apiKey,
                mobileChatSystemPrompt,
              ),
            notifyWaitingForMacSlot,
          );
          assistantText = response.assistantText;
          updateAssistant(assistantText);
          setToolStatus('Sent without live stream (connection fallback)');
        } else {
          throw streamErr;
        }
      }

      markMessageDeliveredToMac();

      const telegramDeferred = isTelegramDeferredEmptyStream(activeSess, assistantText);
      if (!assistantText.trim()) {
        updateAssistant(
          telegramDeferred ? TELEGRAM_QUEUED_REPLY_PLACEHOLDER : GENERIC_EMPTY_STREAM_PLACEHOLDER,
        );
        if (telegramDeferred) {
          setToolStatus('Queued on active Hermes thread — waiting for reply…');
          setRunProgress((prev) =>
            prev
              ? {
                  ...prev,
                  phase: 'running',
                  detail: 'Queued on Hermes thread — your Mac may still be running tools',
                }
              : prev,
          );
          startDeferredTelegramPoll(assistantId, priorAssistants);
        }
      }
      if (!telegramDeferred) {
        setToolStatus(null);
      }
      const typedNudge = parseApprovalNudgeFromContent(typed);
      if (typedNudge) {
        markTextNudgeResolved({
          kind: 'text',
          approveText: typedNudge.approveText,
          title: typedNudge.title,
          sourceMessageIndex: messages.length,
        });
      }
      haptics.success();
      sendSucceeded = true;
      return true;
    } catch (err) {
      const { kind, message } = humanizeChatError(err, 'Message could not send. Try again.', {
        gatewayUrl,
      });
      if (message.includes('That chat was removed')) {
        skipSessionAutoSelectRef.current = true;
        setCurrentSession(null);
        setMessages([]);
        transcriptDigestRef.current = '';
      }
      if (kind === 'connectivity') {
        refreshHealth();
        markOutboundBubbleStatus('failed');
        sendFailureDetail = chatSendBlockedMessage({
          connectionMode: settings.connectionMode,
          connectionState,
          gatewayUrl,
          healthProbePending,
        });
      } else {
        markOutboundBubbleStatus('failed', message);
        setErrorMessage(message);
      }
      sendFailureDetail = message;
      lastFailedSendTextRef.current = userText;
      haptics.warning();
      return outboundUserBubbleCommitted;
    } finally {
      activeChatStreamRef.current = false;
      const releaseOutboundPending = () => {
        if (outboundUserBubbleCommitted && pendingOutboundSendsRef.current > 0) {
          pendingOutboundSendsRef.current -= 1;
        }
      };

      releaseOutboundSendLock();
      if (!deferredTelegramPollRef.current) {
        const completedStartedAt = sendStartedAtRef.current;
        if (sendSucceeded) {
          setRunProgress((prev) => ({
            ...(prev ?? {
              startedAtMs: completedStartedAt,
              sessionId: targetSessionId,
            }),
            phase: 'completed',
            detail: 'Reply ready on your Mac',
            duration: Math.max(0, (Date.now() - completedStartedAt) / 1000),
          }));
          setTimeout(() => {
            setRunProgress((prev) =>
              prev?.phase === 'completed' && prev.startedAtMs === completedStartedAt ? null : prev,
            );
          }, 2500);
        } else if (sendFailureDetail) {
          const failureDetail = sendFailureDetail;
          setRunProgress((prev) => ({
            ...(prev ?? {
              startedAtMs: completedStartedAt,
              sessionId: targetSessionId,
            }),
            phase: 'failed',
            detail: failureDetail,
            duration: Math.max(0, (Date.now() - completedStartedAt) / 1000),
          }));
        }
      }

      if (!isDemo && currentSessionRef.current) {
        void refreshSessionMessagesRef.current?.({ background: true }).finally(releaseOutboundPending);
      } else {
        releaseOutboundPending();
      }
    }
  };

  sendUserTextRef.current = sendUserText;

  useEffect(() => {
    if (!pinnedOutboundText) {
      return;
    }
    const norm = normalizeMessageText(pinnedOutboundText);
    const inTranscript = messages.some(
      (message) =>
        message.role === 'user' &&
        !isMessageDisplayEmpty(message.content) &&
        normalizeMessageText(message.content || '') === norm,
    );
    if (inTranscript && pinnedOutboundStatus === 'sent' && !isSending) {
      const timer = setTimeout(() => {
        setPinnedOutboundText(null);
        setPinnedOutboundStatus('pending');
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [messages, pinnedOutboundText, pinnedOutboundStatus, isSending]);

  useEffect(() => {
    if (!pendingChatRelayText || isSending) {
      return;
    }
    const relay = pendingChatRelayText;
    clearChatRelayText();
    sendUserText(relay, true);
  }, [pendingChatRelayText, clearChatRelayText, isSending]);

  const progressBanner = useMemo((): RunProgressState | null => {
    const activeId = isTelegramInboxSession(currentSession) ? telegramReplySessionId : currentSession?.id;
    const progressMatchesSession =
      !runProgress?.sessionId || !activeId || runProgress.sessionId === activeId || isSending;

    if (runProgress && progressMatchesSession) {
      if (isSending) {
        sendProgressSnapshotRef.current = runProgress;
      }
      return runProgress;
    }

    if (isSending) {
      if (sendProgressSnapshotRef.current) {
        return currentSession
          ? mergeSessionUsageIntoRunProgress(
              sendProgressSnapshotRef.current,
              currentSession,
              sendProgressSnapshotRef.current.detail ?? 'Agent working…',
            )
          : sendProgressSnapshotRef.current;
      }
      const fallback: RunProgressState = {
        phase: 'sending',
        startedAtMs: sendStartedAtRef.current,
        detail:
          queuedOutboundCount > 0
            ? `${queuedOutboundCount} more message(s) queued after this`
            : 'Delivering your message…',
        sessionId: activeId,
      };
      if (currentSession) {
        return mergeSessionUsageIntoRunProgress(fallback, currentSession, fallback.detail);
      }
      return fallback;
    }

    return null;
  }, [runProgress, currentSession?.id, currentSession?.model, currentSession?.input_tokens, currentSession?.output_tokens, telegramReplySessionId, isSending, queuedOutboundCount]);

  const progressBannerFallbackModel = useMemo(
    () =>
      displayableLlmModel(currentSession?.model) ??
      displayableLlmModel(gatewayModel) ??
      undefined,
    [currentSession?.model, gatewayModel],
  );

  const showComposerProgressBanner = useMemo(
    () => shouldShowComposerProgressBanner(progressBanner, isSending),
    [progressBanner, isSending],
  );

  const isRunActive = useMemo(() => {
    if (isSending) {
      return true;
    }
    if (!progressBanner) {
      return false;
    }
    return progressBanner.phase !== 'completed' && progressBanner.phase !== 'failed';
  }, [isSending, progressBanner]);

  const connectivityRunFailure = useMemo(
    () =>
      Boolean(
        progressBanner?.phase === 'failed' &&
          isConnectivityMessage(progressBanner.detail ?? ''),
      ),
    [progressBanner],
  );

  const clearFailedOutboundState = useCallback(() => {
    setRunProgress(null);
    setPinnedOutboundText(null);
    setPinnedOutboundStatus('pending');
    setErrorMessage((prev) => (prev && isConnectivityMessage(prev) ? null : prev));
  }, []);

  const handleRetryConnectivity = useCallback(async () => {
    await handleMacRetry();
  }, [handleMacRetry]);

  const quickActions = useMemo<ChatQuickAction[]>(() => {
    const fallbackActions = buildFallbackPromptActions({
      approvalCount: composerApprovals.length,
      isRunActive,
    });
    const pinnedForActions =
      pinnedOutboundStatus === 'failed' || connectivityRunFailure ? undefined : pinnedOutboundText;
    return buildRecentPromptActions(
      {
        messages,
        sessions: visibleSessions,
        pinnedOutboundText: pinnedForActions,
        currentSessionId: currentSession?.id,
        dismissedPrompts,
      },
      fallbackActions,
    );
  }, [
    composerApprovals.length,
    connectivityRunFailure,
    currentSession?.id,
    isRunActive,
    messages,
    pinnedOutboundStatus,
    pinnedOutboundText,
    visibleSessions,
    dismissedPrompts,
  ]);

  const handleQuickAction = useCallback((action: ChatQuickAction) => {
    haptics.selection();
    inputValueRef.current = action.prompt;
    sendClearSuppressRef.current = false;
    setInputValue(action.prompt);
    setComposerFocusNonce((nonce) => nonce + 1);
  }, []);

  const handleDismissQuickAction = useCallback(async (action: ChatQuickAction) => {
    haptics.selection();
    await storage.saveDismissedPrompt(action.prompt);
    setDismissedPrompts((prev) => [...prev, action.prompt]);
  }, []);

  const handleStopRun = useCallback(async () => {
    const runId = runProgress?.runId ?? progressBanner?.runId;
    if (!runId || isDemo) {
      isSendingRef.current = false;
      setIsSending(false);
      failPendingOutboundBubbles('Stopped');
      setRunProgress((prev) =>
        prev ? { ...prev, phase: 'failed', detail: 'Stopped' } : null,
      );
      haptics.warning();
      return;
    }
    try {
      await stopRun(gatewayUrl, runId, apiKey);
      setRunProgress((prev) =>
        prev ? { ...prev, phase: 'failed', detail: 'Stopped on your Mac' } : null,
      );
      isSendingRef.current = false;
      setIsSending(false);
      haptics.warning();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not stop the run on your Mac',
      );
      haptics.warning();
    }
  }, [
    apiKey,
    failPendingOutboundBubbles,
    gatewayUrl,
    isDemo,
    progressBanner?.runId,
    runProgress?.runId,
    setRunProgress,
  ]);

  const handleStopMacAndRetrySend = useCallback(async () => {
    haptics.warning();
    const runIds = [
      runProgress?.runId,
      runProgressRef.current?.runId,
      sendProgressSnapshotRef.current?.runId,
      progressBanner?.runId,
    ].filter((id): id is string => Boolean(id?.trim()));
    await releaseMacOperatorSlot(gatewayUrl, apiKey, runIds);
    for (const runId of runIds) {
      try {
        await stopRun(gatewayUrl, runId, apiKey);
      } catch {
        // best effort
      }
    }
    isSendingRef.current = false;
    setIsSending(false);
    setRunProgress((prev) =>
      prev ? { ...prev, phase: 'failed', detail: 'Stopped on your Mac' } : null,
    );
    setErrorMessage(null);
    const retryText = lastFailedSendTextRef.current?.trim();
    if (retryText) {
      await sendUserTextRef.current(retryText, true);
    }
  }, [apiKey, gatewayUrl, progressBanner?.runId, runProgress?.runId]);

  const handleSelectAgentThread = useCallback(
    async (session: HermesSession) => {
      haptics.light();
      setRecentChatsDismissed(false);
      skipSessionAutoSelectRef.current = false;
      setCurrentSession(session);
      if (activeProject) {
        const next = setActiveSession(projectState, activeProject.id, session.id);
        await persistProjectState(next);
      }
    },
    [activeProject, projectState, persistProjectState],
  );

  const recentChatsList = useMemo(() => {
    if (!showRecentChatsPanel) {
      return null;
    }
    return (
      <RecentChatsList
        sessions={recentsRailSessions}
        currentSessionId={currentSession?.id}
        sessionLabelFor={sessionLabelFor}
        runProgress={progressBanner}
        isSending={isSending}
        pendingApprovalSessionIds={pendingApprovalSessionIds}
        onSelectSession={handleSelectAgentThread}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onClearAll={handleClearAllChats}
        onNewChat={handleNewChat}
        showActionsWhenEmpty={visibleSessions.length > 0}
        maxItems={12}
        variant="expanded"
        testID="chat-empty-recent-chats"
      />
    );
  }, [
    showRecentChatsPanel,
    recentsRailSessions,
    currentSession?.id,
    sessionLabelFor,
    progressBanner,
    isSending,
    pendingApprovalSessionIds,
    handleSelectAgentThread,
    handleDeleteSession,
    handleRenameSession,
    handleClearAllChats,
    handleNewChat,
    visibleSessions.length,
  ]);

  useEffect(() => {
    const activeSession = currentSessionRef.current;
    if (isDemo || !activeSession || (!isSending && !runProgress)) {
      return;
    }
    const terminal =
      runProgress?.phase === 'completed' || runProgress?.phase === 'failed';
    if (!isSending && terminal) {
      return;
    }

    const sessionId = isTelegramInboxSession(activeSession)
      ? telegramReplySessionId
      : activeSession.id;
    if (!sessionId) {
      return;
    }

    let cancelled = false;
    const pollSessionUsage = async () => {
      try {
        const session = await getSession(gatewayUrl, sessionId, apiKey);
        if (cancelled || !session) {
          return;
        }
        setRunProgress((prev) => {
          const next = mergeSessionUsageIntoRunProgress(
            prev,
            session,
            prev?.detail ?? 'Agent working…',
          );
          if (runProgressForDisplayEqual(prev, next)) {
            return prev;
          }
          return next;
        });
        if (session.model || session.input_tokens || session.output_tokens) {
          setCurrentSession((prev) =>
            prev && prev.id === activeSession.id
              ? {
                  ...prev,
                  model: session.model ?? prev.model,
                  input_tokens: session.input_tokens ?? prev.input_tokens,
                  output_tokens: session.output_tokens ?? prev.output_tokens,
                }
              : prev,
          );
        }
      } catch {
        // ignore transient gateway errors during polling
      }
    };

    void pollSessionUsage();
    const timer = setInterval(pollSessionUsage, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    apiKey,
    currentSession?.id,
    gatewayUrl,
    isDemo,
    isSending,
    runProgress?.phase,
    telegramReplySessionId,
  ]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <ChatScreenHeader
          threadTitle={threadHeaderTitle}
          machineLabel={machineShortLabel}
          machineEndpoint={machineEndpoint}
          routeStatusLabel={routeStatusLabel}
          showMachineDetailWhenConnected={machineHeaderDisplay.showDetailWhenConnected}
          connectionState={connectionState}
          macHttpReachable={macHttpOk}
          isDemo={isDemo}
          workspaceName={activeProject?.name}
          canSwitchWorkspace={projectState.projects.length > 1}
          onOpenThreads={openSessionsModal}
          onOpenTools={() => setToolsModalVisible(true)}
          onPressMachine={() => {
            haptics.selection();
            setMacPickerVisible(true);
          }}
          onPressWorkspace={handlePickWorkspace}
        />
        <CodexCommandCenter
          connectionState={connectionState}
          macHttpReachable={macHttpOk}
          macRetryBusy={macRetryBusy}
          silentHealInFlight={connectionHealInFlight && !macRetryBusy}
          pendingApprovalCount={composerApprovals.length}
          runProgress={progressBanner}
          isSending={isSending}
          machineName={machineShortLabel}
          onOpenApprovals={() => {
            haptics.selection();
            navigation.navigate('Leash' as never);
          }}
          onMacRetry={() => void handleMacRetry()}
        />
      </View>

      <View style={styles.keyboardContainer}>
        {showMacConnectionHelp ? (
          <ScrollView
            style={styles.connectionHelpScroll}
            contentContainerStyle={[
              styles.connectionHelpContent,
              {
                paddingBottom: Math.max(
                  insets.bottom + ANDROID_TAB_BAR_ESTIMATE_PX + 24,
                  112,
                ),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            testID="chat-connection-help-scroll"
            refreshControl={
              <RefreshControl
                refreshing={connectionPanelRefreshing || isScanningMacs}
                onRefresh={() => void handleConnectionPanelRefresh()}
                testID="chat-connection-panel-refresh"
              />
            }
          >
            <ChatConnectionPanel
              connectionState={connectionState}
              connectionMode={settings.connectionMode}
              isRelayPaired={isPaired}
              wifiConnected={wifiConnected}
              relayWorkers={relayWorkers}
              activeRelayWorkerId={activeRelayWorkerId}
              macLabel={machineShortLabel}
              searching={isScanningMacs || profileScanning}
              scanProgress={profileScanProgress}
              scanResult={profileScanResult}
              profiles={gatewayProfiles}
              activeProfileId={activeGatewayProfile?.id ?? null}
              activeProfileReachable={macHttpOk}
              activeProfileConnecting={connectionState === 'connecting'}
              usbLoopback={isLoopbackGatewayUrl(gatewayUrl)}
              usbCableLikely={usbCableLikely}
              cellularBlocksDirect={cellularBlocksDirect}
              usbHostMismatch={usbHostMismatch}
              onSelectProfile={async (profileId) => {
                haptics.light();
                await selectGatewayProfile(profileId);
                await autoConnectGateway();
                await refreshHealth();
                connectEvents();
              }}
              onSearchMac={handleSearchMacFromChat}
              onFixUsbLink={() => void handleMacRetry()}
              usbFixBusy={macRetryBusy}
              onOpenSettings={() => navigation.navigate('Settings' as never)}
              tailscaleDiscoveries={tailscaleDiscoveries}
              tailscaleDiscoveryProbing={tailscaleDiscoveryProbing}
              onAddTailscaleComputer={(discovery) => {
                void addDiscoveredTailscaleComputer(discovery);
              }}
            />
          </ScrollView>
        ) : null}

        {!showMacConnectionHelp && (isLoadingMessages && messages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Fetching session history...</Text>
          </View>
        ) : (
          <View style={styles.chatListSection} testID="chat-list-section">
            {showChatEmptyState ? (
              <ScrollView
                style={styles.emptyScroll}
                contentContainerStyle={[
                  styles.emptyPlaceholder,
                  showRecentChatsPanel ? styles.emptyPlaceholderRecent : null,
                  keyboardOpen ? styles.emptyPlaceholderKeyboardOpen : null,
                ]}
                keyboardShouldPersistTaps="handled"
                testID="chat-empty-state"
              >
                <ChatEmptyGreeting
                  routeLabel={isDemo ? 'Demo Mac' : machineShortLabel}
                  isConnected={connectionState === 'connected' || connectionState === 'demo'}
                />
                {showMacConnectionHelp ? (
                  <Text style={styles.emptyPlaceholderText}>
                    Pick a saved computer above, or tap {machineShortLabel} in the header to switch.
                  </Text>
                ) : showRecentChatsPanel ? (
                  <>
                    {!currentSession ? (
                      <Text style={styles.emptyPlaceholderHint} testID="chat-new-chat-hint">
                        Type below for a new chat, or open a recent one.
                      </Text>
                    ) : null}
                    {recentChatsList}
                  </>
                ) : (
                  <Text style={styles.emptyPlaceholderText}>
                    Type a message below.
                  </Text>
                )}
              </ScrollView>
            ) : (
              <FlashList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item, index) => item.id ?? `${item.role}-${index}`}
                style={styles.flatList}
                contentContainerStyle={styles.messageList}
                nestedScrollEnabled={false}
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
                keyboardShouldPersistTaps="handled"
                drawDistance={400}
                maintainVisibleContentPosition={{
                  startRenderingFromBottom: true,
                  autoscrollToBottomThreshold: 0.2,
                }}
                onScroll={handleChatScroll}
                scrollEventThrottle={16}
                ListFooterComponent={
                  showRecentChatsPanel ? (
                    <View style={styles.recentChatsInThread}>{recentChatsList}</View>
                  ) : undefined
                }
                refreshing={Platform.OS === 'ios' ? isPullRefreshing : undefined}
                onRefresh={
                  Platform.OS === 'ios' && !keyboardOpen
                    ? () => void handleManualSync()
                    : undefined
                }
                onContentSizeChange={() => {
                  if (!inputFocusedRef.current) {
                    scrollChatToLatestIfPinned(isSending);
                  }
                }}
                renderItem={renderChatMessageItem}
              />
            )}
          </View>
        ))}

        {!showMacConnectionHelp ? (
        <View
          style={[
            styles.composerDock,
            Platform.OS === 'ios' && keyboardOpen && styles.composerDockKeyboardOpen,
            {
              paddingBottom: composerDockSpacing.paddingBottom,
              marginBottom: composerDockSpacing.marginBottom,
            },
          ]}
          testID="chat-composer-dock"
        >
        {operationalError ? (
          <View style={styles.composerErrorContainer} testID="chat-operational-error">
            <View style={styles.errorBody}>
              <Text style={styles.errorText}>{operationalError}</Text>
              {showSessionBusyStop ? (
                <TouchableOpacity
                  onPress={() => void handleStopMacAndRetrySend()}
                  testID="chat-stop-mac-run"
                >
                  <Text style={styles.errorAction}>Stop run on Mac & retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setErrorMessage(null)}>
              <Text style={styles.errorClose}>×</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {showSubmittedPromptStrip && pinnedOutboundText ? (
          <SubmittedPromptStrip
            text={pinnedOutboundText}
            status={pinnedOutboundStatus}
            connectionState={connectionState}
            macHttpOk={macHttpOk}
          />
        ) : null}

        {showComposerProgressBanner && progressBanner ? (
          <RunProgressBanner
            progress={progressBanner}
            fallbackModel={progressBannerFallbackModel}
            showTechnicalStats={settings.includeToolActivity}
            onStop={isRunActive && (runProgress?.runId || progressBanner.runId) ? handleStopRun : undefined}
            onDismiss={clearFailedOutboundState}
            onRetry={connectivityRunFailure ? () => void handleRetryConnectivity() : undefined}
            terminalToolName={operatorTerminalLine?.toolName}
            terminalPreview={operatorTerminalLine?.text}
          />
        ) : null}

        {toolStatus && !showComposerProgressBanner ? (
          <View style={styles.toolStatusRow}>
            <Text style={styles.toolStatusText}>{humanizeComposerStatus(toolStatus)}</Text>
          </View>
        ) : null}

        {composerApprovals.length > 0 || undoSecondsLeft > 0 ? (
          <>
            {composerApprovals.length > 0 &&
            connectionState !== 'connected' &&
            connectionState !== 'demo' ? (
              <View style={styles.linkWarningRow} testID="chat-approval-link-warning">
                <Text style={styles.linkWarningText}>
                  Computer not linked — tap the computer row above to connect before approving.
                </Text>
              </View>
            ) : null}
            <ChatApprovalBar
              approvals={composerApprovals}
              busy={approvalBusy || isSending}
              undoSecondsLeft={undoSecondsLeft}
              approvalPolicy={settings.approvalPolicy}
              onChoice={(choice, approval) => handleApprovalChoice(choice, approval)}
              onEdit={handleApprovalEdit}
              onUndo={undoSecondsLeft > 0 ? handleChatApprovalUndo : undefined}
            />
          </>
        ) : null}

        {showMacRetryBanner ? (
          <Pressable
            onPress={() => void handleMacRetry()}
            disabled={macRetryBusy}
            style={({ pressed }) => [
              styles.macRetryBanner,
              macRetryBusy && styles.macRetryBannerBusy,
              pressed && !macRetryBusy && { opacity: 0.82 },
            ]}
            testID="mac-connection-retry-banner"
            accessibilityRole="button"
            accessibilityLabel={macRetryBannerText}
          >
            {macRetryBusy ? (
              <ActivityIndicator size="small" color={colors.warning} style={styles.macRetrySpinner} />
            ) : null}
            <Text style={styles.macRetryBannerText}>{macRetryBannerText}</Text>
          </Pressable>
        ) : null}

        <ChatQuickActions
          actions={quickActions}
          onSelect={handleQuickAction}
          onDismiss={handleDismissQuickAction}
        />

        <ChatInputBar
          value={inputValue}
          onChangeText={handleComposerTextChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onSubmit={handleSubmit}
          placeholder={inputPlaceholder}
          sendMuted={!inputValue.trim()}
          onSend={handleSend}
          showStop={isRunActive}
          onStop={() => void handleStopRun()}
          focusNonce={composerFocusNonce}
        />
        </View>
        ) : null}
      </View>

      <Modal
        visible={macPickerVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setMacPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Switch computer</Text>
              <TouchableOpacity onPress={() => setMacPickerVisible(false)}>
                <Text style={styles.modalCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Pick a saved computer or search Wi‑Fi for Hermes on your network. Another computer not listed?
              Open Hermes on that computer (same Wi‑Fi), then tap Find computers below. Away from home?
              Settings → Advanced → paste a tunnel URL (ngrok, Tailscale, Cloudflare).
            </Text>
            <GatewayProfilePicker
              profiles={gatewayProfiles}
              activeProfileId={activeGatewayProfile?.id ?? null}
              activeReachable={macHttpOk || connectionState === 'connected'}
              activeConnecting={connectionState === 'connecting'}
              scanning={profileScanning || isScanningMacs}
              scanProgress={profileScanProgress}
              scanResult={profileScanResult}
              onSelect={async (profileId) => {
                haptics.light();
                await selectGatewayProfile(profileId);
                await autoConnectGateway();
                await refreshHealth();
                connectEvents();
                setMacPickerVisible(false);
                setCurrentSession(null);
                setMessages([]);
                await loadSessionsList(true);
              }}
              onRemove={
                gatewayProfiles.length > 1
                  ? async (profileId) => {
                      await removeGatewayProfile(profileId);
                    }
                  : undefined
              }
            />
            <LoadingButton
              label="Find computers on Wi‑Fi"
              loadingLabel="Searching Wi‑Fi…"
              loading={isScanningMacs || profileScanning}
              variant="secondary"
              onPress={async () => {
                setIsScanningMacs(true);
                try {
                  await scanForGatewayProfiles();
                } finally {
                  setIsScanningMacs(false);
                }
              }}
              testID="chat-find-macs-on-wifi"
              style={styles.newChatBtn}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={toolsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setToolsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.toolsModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} testID="tools-modal-title">Tools</Text>
              <TouchableOpacity onPress={() => setToolsModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Toolsets, skills, and scheduled jobs on your Mac gateway.
            </Text>
            <ScrollView style={styles.toolsModalScroll} keyboardShouldPersistTaps="handled">
              <GatewayOpsSection />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={sessionModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSessionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle} testID="threads-modal-title">Threads</Text>
                {activeProject ? (
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                    {activeProject.name} chats
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setSessionModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>

            {activeProject ? (
              <Text style={styles.modalSubtitle} numberOfLines={3}>
                {sessionPickerShowsAllMacSessions
                  ? `No chats bound to ${activeProject.name} yet — showing all computer sessions (active + mobile). Start one below or pick a thread.`
                  : `Sessions in this project use workspace: ${activeProject.workspacePath}`}
              </Text>
            ) : null}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.newChatBtn, { flex: 1, marginBottom: 0 }]}
                onPress={handleNewChat}
                testID="modal-new-chat-button"
              >
                <Text style={styles.newChatBtnText}>+ New thread</Text>
              </TouchableOpacity>

              {isClearing ? (
                <View style={[styles.clearingContainer, { flex: 1 }]} testID="threads-modal-clearing">
                  <ActivityIndicator size="small" color={colors.error} />
                  <Text style={styles.clearingText}>Clearing…</Text>
                </View>
              ) : (
                visibleSessions.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.clearAllBtn, { flex: 1, marginBottom: 0 }]}
                    onPress={handleClearAllChats}
                    testID="threads-modal-clear-all"
                  >
                    <Text style={styles.clearAllBtnText}>Clear all</Text>
                  </TouchableOpacity>
                ) : null
              )}
            </View>

            {isLoadingSessions ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
            ) : (
              <SectionList
                sections={sessionPickerSections}
                keyExtractor={(item) => item.id}
                style={styles.sessionList}
                stickySectionHeadersEnabled={false}
                renderSectionHeader={({ section }) =>
                  section.title ? (
                    <Text style={styles.sessionSectionHeader}>{section.title}</Text>
                  ) : null
                }
                renderItem={({ item }) => {
                  const isActive = currentSession?.id === item.id;
                  const lastActiveLabel = formatSessionDate(sessionLastActiveValue(item));
                  const sourceLabel = sessionSourceLabel(item);
                  return (
                    <View style={styles.sessionItemRowContainer}>
                      <TouchableOpacity
                        style={[styles.sessionItem, isActive && styles.sessionItemActive, { flex: 1 }]}
                        onPress={async () => {
                          haptics.light();
                          setRecentChatsDismissed(false);
                          setCurrentSession(item);
                          setSessionModalVisible(false);
                          if (activeProject) {
                            const next = setActiveSession(projectState, activeProject.id, item.id);
                            await persistProjectState(next);
                          }
                        }}
                      >
                        <View style={styles.sessionItemTitleRow}>
                          <Text
                            style={[styles.sessionItemTitle, isActive && styles.sessionItemTitleActive]}
                            numberOfLines={2}
                          >
                            {sessionLabelFor(item)}
                          </Text>
                          {sourceLabel ? (
                            <Text style={styles.sessionSourcePill}>{sourceLabel}</Text>
                          ) : null}
                        </View>
                        {isTelegramInboxSession(item) ? (
                          <Text style={styles.sessionItemSubtitle}>
                            Merged view — pick a single thread for 1:1 parity with your computer
                          </Text>
                        ) : null}
                        {lastActiveLabel ? (
                          <Text style={styles.sessionItemTime}>{lastActiveLabel}</Text>
                        ) : null}
                      </TouchableOpacity>

                      {item.id !== '__telegram_inbox__' ? (
                        <View style={styles.sessionActionRow}>
                          <Pressable
                            onPress={() => handleRenameSession(item.id, sessionLabelFor(item))}
                            style={({ pressed }) => [styles.sessionActionBtn, pressed && { opacity: 0.7 }]}
                            accessibilityRole="button"
                            accessibilityLabel={`Rename thread ${sessionLabelFor(item)}`}
                            testID={`recent-chat-rename-${item.id}`}
                          >
                            <Text style={styles.sessionActionText}>✎</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteSession(item.id)}
                            style={({ pressed }) => [styles.sessionActionBtn, pressed && { opacity: 0.7 }]}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete thread ${sessionLabelFor(item)}`}
                            testID={`recent-chat-delete-${item.id}`}
                          >
                            <Text style={styles.sessionActionText}>🗑</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.emptySessionsText}>
                    {activeProject
                      ? `No chats yet for ${activeProject.name}. Start one below.`
                      : 'No past sessions found.'}
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={projectModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setProjectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add computer workspace</Text>
              <TouchableOpacity onPress={() => setProjectModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Each project gets its own chat history and pins Hermes tools to that folder on your computer.
            </Text>
            <Text style={styles.fieldLabel}>Workspace path</Text>
            <TextInput
              style={styles.modalInput}
              value={newProjectPath}
              onChangeText={setNewProjectPath}
              placeholder="~/workspace/git/igor/ThumbGate"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              testID="new-project-path-input"
            />
            <Text style={styles.fieldLabel}>Display name (optional)</Text>
            <TextInput
              style={styles.modalInput}
              value={newProjectName}
              onChangeText={setNewProjectName}
              placeholder="ThumbGate"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              testID="new-project-name-input"
            />
            <TouchableOpacity style={styles.newChatBtn} onPress={handleAddProject} testID="save-project-button">
              <Text style={styles.newChatBtnText}>Add project</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={renameModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { minHeight: 180, justifyContent: 'center' }]}>
            <Text style={[styles.modalTitle, { marginBottom: 12 }]} testID="rename-modal-title">
              Rename thread
            </Text>
            <TextInput
              style={[styles.modalInput, {
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 10,
                color: colors.text,
                backgroundColor: colors.composerSurface,
                marginBottom: 16,
              }]}
              value={renameValue}
              onChangeText={setRenameValue}
              testID="rename-session-input"
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity
                style={{ paddingVertical: 8, paddingHorizontal: 16 }}
                onPress={() => setRenameModalVisible(false)}
              >
                <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: colors.primary,
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 6,
                }}
                onPress={handleSaveRename}
                testID="rename-session-save"
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ChatMessageDetailModal
        visible={messageDetail != null}
        title={messageDetail?.title ?? ''}
        body={messageDetail?.body ?? ''}
        onClose={() => setMessageDetail(null)}
      />

      <FeedbackPromptModal
        visible={feedbackPrompt != null}
        signal={feedbackPrompt?.signal ?? 'up'}
        onClose={() => resolveFeedbackPrompt()}
        onSubmit={resolveFeedbackPrompt}
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
    flexShrink: 0,
    zIndex: 2,
    elevation: 2,
    paddingTop: 4,
    paddingBottom: 6,
    backgroundColor: colors.backgroundStart,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0,
  },
  demoPill: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.backgroundStart,
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  projectChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  projectChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  projectChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79, 70, 229, 0.18)',
  },
  projectChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  projectChipTextActive: {
    color: colors.text,
  },
  projectChipAdd: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  projectChipAddText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  workspacePath: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  workspaceHint: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  sessionSelectorLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  sessionSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  sessionSelectorText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  dropdownArrow: {
    fontSize: 10,
    color: colors.textMuted,
  },
  keyboardContainer: {
    flex: 1,
    minHeight: 0,
  },
  connectionHelpScroll: {
    flex: 1,
  },
  connectionHelpContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  emptyScroll: {
    flex: 1,
  },
  chatListSection: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  chatListFlex: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: CHAT_LIST_HEADER_CLEARANCE,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  bubbleWrapper: {
    flexDirection: 'row',
    marginBottom: 12,
    width: '100%',
  },
  bubbleUserWrapper: {
    justifyContent: 'flex-end',
  },
  bubbleAssistantWrapper: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 2,
  },
  bubbleAssistant: {
    backgroundColor: colors.cardBg,
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderBottomLeftRadius: 2,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleUserText: {
    color: colors.text,
    fontWeight: '500',
  },
  bubbleAssistantText: {
    color: colors.textSecondary,
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  bubbleUserTime: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  bubbleAssistantTime: {
    color: colors.textMuted,
  },
  emptyPlaceholder: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  emptyPlaceholderRecent: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  emptyPlaceholderKeyboardOpen: {
    justifyContent: 'flex-start',
    paddingTop: 12,
  },
  emptyPlaceholderText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyPlaceholderHint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  newChatBtnInline: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  newChatBtnInlineText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
  },
  thinkingText: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  linkWarningRow: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
    backgroundColor: 'rgba(9, 11, 20, 0.96)',
  },
  linkWarningText: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '600',
  },
  macRetryBanner: {
    marginHorizontal: 12,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macRetryBannerBusy: {
    opacity: 0.92,
  },
  macRetrySpinner: {
    flexShrink: 0,
  },
  macRetryBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
    lineHeight: 17,
  },
  toolStatusRow: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  toolStatusText: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600',
  },
  composerDock: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: 'rgba(9, 11, 20, 0.96)',
  },
  composerDockKeyboardOpen: {
    paddingTop: 8,
    borderTopColor: 'rgba(148, 163, 184, 0.35)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 120,
    minHeight: 44,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingHorizontal: 18,
    minHeight: 44,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(79, 70, 229, 0.4)',
  },
  sendButtonText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  errorContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 8,
    margin: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  composerErrorContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  errorBody: {
    flex: 1,
    gap: 6,
  },
  errorAction: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  errorClose: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0F1321',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  toolsModalContent: {
    maxHeight: '88%',
  },
  toolsModalScroll: {
    flexGrow: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 12,
    lineHeight: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 13,
    marginBottom: 12,
  },
  modalCloseBtn: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '700',
  },
  newChatBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  newChatBtnText: {
    color: colors.text,
    fontWeight: '700',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  clearAllBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  clearAllBtnText: {
    color: '#EF4444',
    fontWeight: '700',
  },
  clearingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
    borderColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  clearingText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  sessionList: {
    marginBottom: 20,
  },
  sessionItem: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  sessionItemActive: {
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
    borderRadius: 8,
  },
  sessionItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  sessionItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  sessionItemTitleActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  sessionSourcePill: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0,
    color: colors.accent,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sessionSectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  sessionItemTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
  sessionItemSubtitle: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptySessionsText: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 20,
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  statusText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  statusValue: {
    color: colors.accent,
    fontWeight: '700',
  },
  statusDivider: {
    fontSize: 11,
    color: colors.borderLight,
  },
  flatList: {
    flex: 1,
  },
  recentChatsInThread: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sessionItemRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sessionActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 12,
  },
  sessionActionBtn: {
    padding: 8,
  },
  sessionActionText: {
    fontSize: 16,
    color: colors.textMuted,
  },
});
