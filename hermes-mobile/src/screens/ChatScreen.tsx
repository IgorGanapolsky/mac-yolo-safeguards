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
  RefreshControl,
  ScrollView,
  SectionList,
  AppState,
  BackHandler,
  Keyboard,
  Alert,
  useWindowDimensions,
  Dimensions,
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
import {
  composerDockInsets,
  focusedAndroidKeyboardFallbackInset,
  keyboardOverlapHeight,
  ANDROID_TAB_BAR_ESTIMATE_PX,
} from '../utils/composerKeyboard';
import Constants from 'expo-constants';
import { colors } from '../theme/colors';
import { isDemoModeAllowed } from '../utils/demoModePolicy';
import { haptics } from '../services/haptics';
import GatewayProfilePicker from '../components/GatewayProfilePicker';
import {
  listSessions,
  createSession,
  createSessionWithUniqueTitle,
  getSession,
  listMessages,
  sendChatMessage,
  updateSessionTitle,
} from '../services/hermesChatClient';
import {
  chatSendBlockedMessage,
  humanizeChatError,
  isConnectivityMessage,
  isSessionInUseError,
  isSessionRemovedError,
} from '../utils/chatErrors';
import {
  HermesGatewayApiError,
  deleteSession,
  clearAllSessions,
  forkSession,
  getCapabilities,
  extractCapabilitiesModel,
  getRunStatus,
  stopRun,
  streamSessionChat,
  getObsidianProjects,
  getObsidianAgents,
} from '../services/hermesGatewayClient';
import { fetchGatewayHealth, gatewayAuthRepairBanner } from '../services/gatewayClient';
import { secureCredentials } from '../services/secureCredentials';
import type { HermesSession, HermesMessage } from '../types/chat';
import type { ChatProject, ChatProjectState } from '../types/chatProject';
import { EMPTY_CHAT_PROJECT_STATE } from '../types/chatProject';
import {
  bindSessionToProject,
  chatProjects,
  clearAllSessionBindings,
  clearBoundSessions,
  mergeVaultCatalogIntoState,
  pinSessionLabel,
  projectNameForSession,
  resolveActiveProjectId,
  setActiveProjectForComputer,
  setActiveSession,
} from '../services/chatProjects';
import { fetchVaultProjectCatalog } from '../services/vaultProjects';
import { filterChatProjects } from '../utils/filterChatProjects';
import type { VaultProjectCatalog } from '../types/vaultProject';
import { storage } from '../services/storage';
import { buildMobileChatSystemPrompt } from '../utils/workspacePrompt';
import {
  formatSessionCreated,
  formatSessionTitle,
  filterDismissedThreadSessions,
  GENERIC_NEW_SESSION_TITLE,
  isAutomatedCronSession,
  isRecentsRailSession,
  sessionCreatedValue,
  deriveThreadTitleFromMessage,
  sessionDisplayTitle,
  sessionPickerLabel,
  sessionLastActiveValue,
  shouldAutoTitleSession,
  titleFromFirstPrompt,
  ensureSessionCreatedAt,
} from '../utils/sessionDisplay';
import { findResumableSessionByPromptTitle } from '../utils/resumeExistingSession';
import { formatMessageTimestamp, prepareMessagesForDisplay, resolveMessageTimestamp } from '../utils/chatMessageDisplay';
import {
  isMessageBodyEmpty,
  isMessageDisplayEmpty,
  mergeServerMessagesWithPending,
  dedupeChatMessages,
  transcriptDigest,
  hasUnsyncedLocalMessages,
  normalizeMessageText,
  findDeferredPlaceholderAfterLastUser,
} from '../utils/chatMessageMerge';
import {
  resolveChatOutputFeedbackBusyKey,
  shouldShowChatOutputFeedback,
} from '../utils/chatOutputFeedback';
import { isThumbgateLeashUnlocked } from '../utils/thumbgateLeash';
import {
  displayableLlmModel,
  humanizeComposerStatus,
  isActiveChatRun,
  shouldShowComposerProgressBanner,
} from '../utils/runProgressDisplay';
import {
  classifyRunStale,
  isTerminalGatewayRunStatus,
  msUntilNoTokenFail,
  msUntilRunStaleAutoFail,
  msUntilStreamIdleFail,
  RUN_NO_TOKEN_FAIL_DETAIL,
  RUN_STREAM_IDLE_FAIL_DETAIL,
  RUN_STALE_TIMEOUT_DETAIL,
  shouldFailRunAwaitingFirstToken,
  shouldFailRunForStreamIdle,
} from '../utils/runStaleDetection';
import { isChatAtTop, isChatNearBottom } from '../utils/chatScrollSync';
import {
  COMPOSER_DRAFT_SAVE_DEBOUNCE_MS,
  clearComposerDraft,
  loadComposerDraft,
  saveComposerDraft,
} from '../utils/composerDraftStorage';
import {
  chatDistanceFromBottom,
  resolveUserScrolledUp,
  shouldAutoScroll,
  shouldCancelPendingScroll,
} from '../utils/chatAutoScroll';
import ChatScrollControls from '../components/ChatScrollControls';
import {
  CHAT_LIST_HEADER_CLEARANCE,
  filterChatTimelineMessages,
  shouldShowSubmittedPromptStrip,
  type ChatTimelineEntry,
} from '../utils/chatOutboundDisplay';
import {
  hasAssistantReplyInMessages,
  hasUserMessageInTranscript,
  shouldShowRecentChatsPanel,
} from '../utils/chatRecentChatsPanel';
import ChatScreenHeader from '../components/ChatScreenHeader';
import ExpandableThreadTitle from '../components/ExpandableThreadTitle';
import ChatEmptyGreeting from '../components/ChatEmptyGreeting';
import CodexCommandCenter from '../components/CodexCommandCenter';
import RecentChatsList from '../components/RecentChatsList';
import SubmittedPromptStrip from '../components/SubmittedPromptStrip';
import ChatConnectionPanel from '../components/ChatConnectionPanel';
import LoadingButton from '../components/ui/LoadingButton';
import ChatInputBar from '../components/ChatInputBar';
import VaultProjectPickerChip from '../components/VaultProjectPickerChip';
import ChatMessageListItem from '../components/ChatMessageListItem';
import BottomSheetModal from '../components/BottomSheetModal';
import ChatMessageDetailModal from '../components/ChatMessageDetailModal';
import FeedbackPromptModal from '../components/FeedbackPromptModal';
import GatewayOpsSection from '../components/GatewayOpsSection';
import ChatApprovalBar from '../components/ChatApprovalBar';
import RunProgressBanner from '../components/RunProgressBanner';
import ComposerErrorBanner from '../components/ComposerErrorBanner';
import type { RunProgressState } from '../types/chatDisplay';
import type { GatewayEventMessage } from '../types/gateway';
import { applyStreamEvent, attachRunMetadata, mergeRunUsageFromPayload, mergeSessionUsageIntoRunProgress, runProgressForDisplayEqual } from '../utils/chatStreamEvents';
import {
  WAITING_FOR_PRIOR_CHAT_DETAIL,
  reconcileFrozenSessionBusyState,
  reconcileStaleActiveRunProgress,
  releaseMacOperatorSlot,
  retryOnSessionInUse,
} from '../utils/chatSessionRecovery';
import {
  classifyMegaSession,
  isMegaSession,
  megaSessionBannerCopy,
  megaSessionSendBlockedCopy,
  megaSessionSendWarnMessage,
  megaSessionSendWarnTitle,
  sessionTotalTokens,
} from '../utils/sessionTokenGuards';
import { resolveChatProject } from '../utils/chatContext';
import { resolveComputerSessionStorageKeys } from '../utils/computerSessionStorage';
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
  shouldShowConnectivityRunBanner,
} from '../utils/connectionErrorPolicy';
import {
  formatSavedMacUnreachableBanner,
  reconnectingToMacCopy,
  savedMacUnreachableStatus,
  shouldShowActiveReconnectingCopy,
} from '../utils/macUnreachableCopy';
import { isLoopbackGatewayUrl } from '../utils/gatewayUrlPolicy';
import { isInvalidGatewayProfile } from '../services/gatewayProfiles';
import { isPrivateLanGatewayUrl } from '../utils/gatewayEndpoint';
import { detectUsbHostMismatch, profilesForSwitchComputerPicker } from '../utils/gatewayProfilePicker';
import TailscaleDiscoveryBanner from '../components/TailscaleDiscoveryBanner';
import { USB_LOOPBACK_GATEWAY_URL } from '../utils/gatewayLoopbackFallback';
import {
  isMacGatewayHttpOk,
  isGatewayHealthPending,
  resolveEffectiveMacHttpOk,
} from '../utils/gatewayConnection';
import {
  pairServerHostFromGatewayUrl,
  resolvePairServerSetupParams,
} from '../services/gatewayDiscovery';
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
  findLastFailedOutboundText,
  resolveComposerSendAction,
  shouldHideMacTileForSilentHeal,
  shouldShowFailedSendRetry,
} from '../utils/failedSendRetry';
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
import { isTelegramSession, pickPrimaryTelegramSession, buildSessionPickerSections, sessionSourceLabel } from '../utils/sessionSelection';
import { resolveSessionAfterListLoad } from '../utils/sessionListSelection';
import {
  extractAssistantFromRunCompletedPayload,
  findNewAssistantReply,
  GENERIC_EMPTY_STREAM_PLACEHOLDER,
  isDeferredStreamPlaceholder,
  isTelegramDeferredEmptyStream,
  snapshotAssistantBodies,
  TELEGRAM_QUEUED_REPLY_PLACEHOLDER,
} from '../utils/streamAssistantText';
import {
  DEFERRED_REPLY_POLL_MAX_MS,
  DEFERRED_REPLY_POLL_MS,
  EMPTY_REPLY_FAILURE_REASON,
  shouldAwaitGatewayReplyAfterSend,
} from '../utils/emptyStreamReplyRecovery';
import { extractTerminalActivityFromMessage, isTerminalToolName } from '../utils/terminalActivity';
import type { ChatMessageContent, ComposerAttachment } from '../types/chatAttachment';
import {
  composerHasSendableContent,
  formatAttachmentBubbleText,
  MAX_COMPOSER_ATTACHMENTS,
  pickDocumentAttachments,
  pickImageAttachments,
  prepareChatMessageContent,
} from '../utils/chatAttachments';

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

/**
 * Effective software-keyboard inset used to lift the composer dock.
 *
 * The Android fallback ({@link focusedAndroidKeyboardFallbackInset}) estimates a keyboard
 * height when the OS reports 0 while the IME is genuinely on screen (edge-to-edge / pan
 * layouts). That estimate must ONLY apply while the keyboard is actually visible: a
 * TextInput that keeps focus after the keyboard is dismissed (Android back button, plus
 * `blurOnSubmit={false}` on the composer) would otherwise lift the whole dock ~280–360dp
 * into mid-screen and leave a large dead region below the composer.
 */
export function resolveEffectiveKeyboardInset(
  keyboardInset: number,
  keyboardScreenVisible: boolean,
  inputFocused: boolean,
  windowHeight: number,
  /** Test seam: Android Keyboard.metrics().height without mocking Keyboard globally. */
  androidMetricsHeight?: number,
): number {
  if (keyboardInset > 0) {
    return keyboardInset;
  }
  const metricsHeight =
    androidMetricsHeight ??
    (Platform.OS === 'android' ? (Keyboard.metrics()?.height ?? 0) : 0);
  // Only trust live metrics while the keyboard is on screen — stale metrics after
  // dismiss (or run-banner layout shifts) otherwise lift the dock into mid-screen.
  if (metricsHeight > 0 && keyboardScreenVisible) {
    return metricsHeight;
  }
  if (!keyboardScreenVisible) {
    return 0;
  }
  return focusedAndroidKeyboardFallbackInset(inputFocused, keyboardInset, windowHeight);
}

/** Android layout shifts (e.g. run-progress banner) can spuriously emit keyboardDidHide. */
export function shouldClearKeyboardScreenVisible(
  platformOs: string,
  metricsHeight: number,
): boolean {
  if (platformOs !== 'android') {
    return true;
  }
  return metricsHeight <= 0;
}

type ComposerDockSpacing = {
  paddingBottom: number;
  marginBottom: number;
};

/**
 * Layout style for the chat composer dock. Android MUST lift with marginBottom — never
 * translateY when marginBottom > 0, or the TextInput stays visible but untappable (#91).
 */
export function composerDockContainerStyle(
  _platformOs: string,
  spacing: ComposerDockSpacing,
): ComposerDockSpacing {
  return {
    paddingBottom: spacing.paddingBottom,
    marginBottom: spacing.marginBottom,
  };
}

/**
 * Android can fire keyboardDidHide during transient layout shifts while typing
 * (for example, when progress/banner content reflows). Ignore those only when
 * the composer is still focused and keyboard metrics still report height.
 */
export function shouldIgnoreKeyboardHide(
  platformOs: string,
  metricsHeight: number,
  inputFocused: boolean,
): boolean {
  return platformOs === 'android' && inputFocused && metricsHeight > 0;
}

/** How long the "Reply ready on your computer" banner stays before auto-dismiss. */
const RUN_COMPLETED_BANNER_DISMISS_MS = 2500;

/** How long the per-message "Saved to ThumbGate" confirmation stays visible. */
const FEEDBACK_NOTE_TTL_MS = 4000;

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
    tailnetProbeHostCount,
    addDiscoveredTailscaleComputer,
    probeTailscaleComputers,
    connectionHealAttempt,
    connectionHealInFlight,
    connectionHealExhausted,
  } = useGatewayConnection();
  const [activeAgents, setActiveAgents] = useState<{ name: string; status: string }[]>([]);
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
  const windowDimensions = useWindowDimensions();
  
  const [sessions, setSessions] = useState<HermesSession[]>([]);
  const deletedDemoSessionIdsRef = useRef<Set<string>>(new Set());
  const [currentSession, setCurrentSession] = useState<HermesSession | null>(null);
  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  /** HTTP chat stream in flight — keep WS from clearing runProgress before first token. */
  const [isChatStreamActive, setIsChatStreamActive] = useState(false);
  const [sessionModalVisible, setSessionModalVisible] = useState(false);
  const [toolsModalVisible, setToolsModalVisible] = useState(false);
  const [macPickerVisible, setMacPickerVisible] = useState(false);
  const switchComputerProfiles = useMemo(
    () =>
      profilesForSwitchComputerPicker(gatewayProfiles, {
        activeProfileId: activeGatewayProfile?.id ?? null,
      }),
    [activeGatewayProfile?.id, gatewayProfiles],
  );
  const [isScanningMacs, setIsScanningMacs] = useState(false);
  const [projectModalVisible, setProjectModalVisible] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [projectState, setProjectState] = useState<ChatProjectState>(EMPTY_CHAT_PROJECT_STATE);
  const [isProjectsLoaded, setIsProjectsLoaded] = useState(false);
  const [vaultCatalog, setVaultCatalog] = useState<VaultProjectCatalog | null>(null);
  const [vaultCatalogLoading, setVaultCatalogLoading] = useState(false);
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
  /** Sticky real model from the latest session/run, so idle turns never fall back to a bare label. */
  const [lastKnownModel, setLastKnownModel] = useState<string | undefined>();
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [connectionPanelRefreshing, setConnectionPanelRefreshing] = useState(false);
  const [telegramInboxMeta, setTelegramInboxMeta] = useState({ threadCount: 0, messageCap: 250 });
  const skipSessionAutoSelectRef = useRef(false);
  /** Recent-thread tap — survives in-flight listSessions before project state persists. */
  const manualSessionSelectRef = useRef<string | null>(null);
  /** Invalidates in-flight dismissed-session hydration after clear-all. */
  const dismissedHydrationGenRef = useRef(0);
  const dismissedSessionIdsRef = useRef<string[]>([]);
  const hideCronSessionsRef = useRef(false);
  const [composerFocusNonce, setComposerFocusNonce] = useState(0);
  const [recentChatsDismissed, setRecentChatsDismissed] = useState(false);
  const [dismissedSessionIds, setDismissedSessionIds] = useState<string[]>([]);
  const [hideCronSessions, setHideCronSessions] = useState(false);
  const [messageDetail, setMessageDetail] = useState<{ title: string; body: string } | null>(null);
  const [feedbackPrompt, setFeedbackPrompt] = useState<{
    message: HermesMessage;
    signal: 'up' | 'down';
  } | null>(null);
  // Per-message selected thumb (highlight state). Keyed by the same stable key as
  // the busy flag so it survives re-renders. The vote is submitted to ThumbGate on
  // tap; the details sheet is opt-in (no longer auto-opened).
  const [feedbackSelections, setFeedbackSelections] = useState<
    Record<string, 'up' | 'down'>
  >({});
  // Per-message transient confirmation shown after a thumbs tap, so the operator
  // can SEE the vote reached ThumbGate (chat feedback does not surface in the
  // Leash tab or the local dashboard — those are different stores).
  const [feedbackNotes, setFeedbackNotes] = useState<
    Record<string, { text: string; error: boolean }>
  >({});

  const applyChatApiError = useCallback(
    (error: unknown, fallback: string, options?: { background?: boolean }) => {
      const { kind, message } = humanizeChatError(error, fallback, {
        gatewayUrl,
        machineLabel: activeGatewayProfile?.label,
      });
      if (kind === 'connectivity') {
        refreshHealth();
        return;
      }
      if (kind === 'auth') {
        refreshHealth();
        if (options?.background) {
          return;
        }
        setErrorMessage(message);
        return;
      }
      if (options?.background) {
        return;
      }
      setErrorMessage(message);
    },
    [refreshHealth, gatewayUrl, activeGatewayProfile?.label],
  );

  const flatListRef = useRef<FlashListRef<ChatTimelineEntry>>(null);
  const isSendingRef = useRef(false);
  /** User explicitly scrolled up to read history — suppress auto-follow until they return. */
  const userScrolledUpRef = useRef(false);
  const userDraggingRef = useRef(false);
  const lastDistanceFromBottomRef = useRef(0);
  const scrollCancelGenerationRef = useRef(0);
  /** Force one bottom pin after session/computer switch once transcript content lays out. */
  const pinScrollAfterHydrationRef = useRef(false);
  const messagesRef = useRef<HermesMessage[]>([]);
  const sessionsLoadGenRef = useRef(0);
  const prevMacChatLiveRef = useRef<boolean | null>(null);
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
    ((options?: { background?: boolean; manual?: boolean; force?: boolean }) => Promise<void>) | null
  >(null);
  const inputFocusedRef = useRef(false);
  /** Android-only: one re-render when composer focuses so padding latches before keyboard inset. */
  const [composerLayoutNonce, setComposerLayoutNonce] = useState(0);
  const pendingTranscriptSyncRef = useRef(false);
  const transcriptSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  /** When a force/manual select is requested while a refresh is in flight, replay with force. */
  const refreshQueuedForceRef = useRef(false);
  const deferredTelegramPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Keep HTTP transcript polling alive until gateway reply text lands (relay WS ≠ chat transport). */
  const awaitingGatewayReplyRef = useRef(false);
  const [awaitingGatewayReply, setAwaitingGatewayReply] = useState(false);
  const runProgressRef = useRef<RunProgressState | null>(null);
  const sendProgressSnapshotRef = useRef<RunProgressState | null>(null);
  const transcriptDigestRef = useRef('');
  /** Ignore spurious onChangeText after Send clears the field (Android IME blur). */
  const sendClearSuppressRef = useRef(false);
  const lastSentComposerTextRef = useRef('');
  const composerDraftSessionRef = useRef<string | null>(null);
  const composerDraftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendUserTextRef = useRef<(text: string, isProgrammatic?: boolean) => Promise<boolean>>(
    async () => false,
  );
  const lastFailedSendTextRef = useRef<string | null>(null);
  const activeChatStreamRef = useRef(false);
  /** Session ids the gateway rejected as removed/restarted — never resume or target these again. */
  const removedSessionIdsRef = useRef<Set<string>>(new Set());
  const [inputFocused, setInputFocused] = useState(false);
  const [chatNearBottom, setChatNearBottom] = useState(true);
  const [chatNearTop, setChatNearTop] = useState(true);
  /** True only while the software keyboard is actually on screen (didShow → didHide). */
  const [keyboardScreenVisible, setKeyboardScreenVisible] = useState(false);

  const { inset: keyboardInset, windowShrunk: keyboardWindowShrunk } = useKeyboardInset({
    suppressHideWhileFocusedRef: inputFocusedRef,
    focused: inputFocused,
  });

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardScreenVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => {
      const settleHide = () => {
        const metricsHeight = Keyboard.metrics()?.height ?? 0;
        if (shouldIgnoreKeyboardHide(Platform.OS, metricsHeight, inputFocusedRef.current)) {
          return;
        }
        if (!shouldClearKeyboardScreenVisible(Platform.OS, metricsHeight)) {
          return;
        }
        setKeyboardScreenVisible(false);
      };
      if (Platform.OS === 'android') {
        requestAnimationFrame(() => requestAnimationFrame(settleHide));
        return;
      }
      settleHide();
    });
    const subs = [showSub, hideSub];
    if (Platform.OS === 'android') {
      subs.push(
        Keyboard.addListener('keyboardDidChangeFrame', (event) => {
          const overlap = keyboardOverlapHeight(
            event.endCoordinates,
            Dimensions.get('window').height,
          );
          if (overlap <= 0) {
            setKeyboardScreenVisible(false);
          } else {
            setKeyboardScreenVisible(true);
          }
        }),
      );
    }
    return () => {
      for (const sub of subs) {
        sub.remove();
      }
    };
  }, []);

  const [queuedOutboundCount, setQueuedOutboundCount] = useState(0);
  const [pinnedOutboundText, setPinnedOutboundText] = useState<string | null>(null);
  const [pinnedOutboundSentAt, setPinnedOutboundSentAt] = useState<string | null>(null);
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
    // Non-inverted FlashList: scrollToEnd scrolls to the latest messages at the bottom.
    const generation = scrollCancelGenerationRef.current;
    const run = () => {
      if (generation !== scrollCancelGenerationRef.current) {
        return;
      }
      flatListRef.current?.scrollToEnd({ animated });
    };
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
  }, []);

  const isChatStreamingActive = useCallback(() => {
    return (
      isSendingRef.current ||
      activeChatStreamRef.current ||
      isActiveChatRun(runProgressRef.current)
    );
  }, []);

  const scrollChatToLatestIfPinned = useCallback(
    (animated = false, force = false) => {
      if (userScrolledUpRef.current) {
        return;
      }
      const streaming = isChatStreamingActive();
      if (
        force ||
        shouldAutoScroll(lastDistanceFromBottomRef.current, streaming, false)
      ) {
        scrollChatToLatest(animated && !streaming);
      }
    },
    [isChatStreamingActive, scrollChatToLatest],
  );

  const scrollChatToTop = useCallback((animated = true) => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);

  const handleJumpToBottom = useCallback(() => {
    haptics.light();
    userScrolledUpRef.current = false;
    lastDistanceFromBottomRef.current = 0;
    setChatNearBottom(true);
    scrollChatToLatest(true);
  }, [scrollChatToLatest]);

  const handleJumpToTop = useCallback(() => {
    haptics.light();
    scrollChatToTop(true);
  }, [scrollChatToTop]);

  const handleChatScrollBeginDrag = useCallback(() => {
    userDraggingRef.current = true;
  }, []);

  const handleChatScrollEndDrag = useCallback(() => {
    userDraggingRef.current = false;
  }, []);

  const handleChatScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      const distanceFromBottom = chatDistanceFromBottom(
        layoutMeasurement.height,
        contentOffset.y,
        contentSize.height,
      );
      lastDistanceFromBottomRef.current = distanceFromBottom;
      const nearBottom = isChatNearBottom(
        layoutMeasurement.height,
        contentOffset.y,
        contentSize.height,
      );
      const nearTop = isChatAtTop(contentOffset.y);
      const streaming = isChatStreamingActive();
      const wasFollowing = shouldAutoScroll(
        distanceFromBottom,
        streaming,
        userScrolledUpRef.current,
      );
      if (
        shouldCancelPendingScroll({
          userScrolledUp: userScrolledUpRef.current,
          wasFollowing,
          nearBottom,
        })
      ) {
        scrollCancelGenerationRef.current += 1;
      }
      userScrolledUpRef.current = resolveUserScrolledUp({
        nearBottom,
        userDragging: userDraggingRef.current,
        prevUserScrolledUp: userScrolledUpRef.current,
      });
      setChatNearBottom((prev) => (prev === nearBottom ? prev : nearBottom));
      setChatNearTop((prev) => (prev === nearTop ? prev : nearTop));
    },
    [isChatStreamingActive],
  );

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
        const model = extractCapabilitiesModel(caps);
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
  const activeComputerSessionKeys = useMemo(
    () => resolveComputerSessionStorageKeys(activeGatewayProfile, gatewayUrl),
    [activeGatewayProfile, gatewayUrl],
  );
  const cellularBlocksDirect = useMemo(
    () => !wifiConnected && isPrivateLanGatewayUrl(gatewayUrl),
    [wifiConnected, gatewayUrl],
  );
  /** Chat needs direct HTTP to the Mac — relay WebSocket "connected" is not enough. */
  const macChatLive = isDemo || macHttpOk;
  const lastFailedOutboundText = useMemo(
    () => findLastFailedOutboundText(messages),
    [messages],
  );
  const connectivityRunFailure = useMemo(
    () =>
      shouldShowFailedSendRetry({
        runPhase: runProgress?.phase,
        runDetail: runProgress?.detail,
        lastFailedText: lastFailedOutboundText,
      }),
    [runProgress, lastFailedOutboundText],
  );
  const effectiveMacHttpOk = useMemo(
    () =>
      resolveEffectiveMacHttpOk({
        macHttpOk,
        connectivityFailure: connectivityRunFailure,
      }),
    [macHttpOk, connectivityRunFailure],
  );
  const effectiveMacChatLive = isDemo || effectiveMacHttpOk;
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
        tailnetProbeHosts:
          tailnetProbeHostCount > 0 ? Array(tailnetProbeHostCount).fill('probe') : [],
        tailscaleDiscoveries,
      }),
    [gatewayUrl, gatewayProfiles, tailnetProbeHostCount, tailscaleDiscoveries],
  );
  const userSendFailed = pinnedOutboundStatus === 'failed';
  const hasRetryableFailedSend = Boolean(lastFailedOutboundText?.trim());
  const chatStalled = hasRetryableFailedSend && macHttpOk && !connectivityRunFailure;
  const hideMacTileForSilentHeal = shouldHideMacTileForSilentHeal({
    silentHealInFlight: connectionHealInFlight,
    macRetryBusy,
    userSendFailed,
    hasRetryableFailedSend,
  });
  const showMacConnectionHelp = shouldShowMacConnectionHelp({
    isDemo,
    macChatLive: effectiveMacChatLive,
    healthProbePending,
    healthLevel: health?.level,
    heal: connectionHeal,
    userSendFailed,
    profiles: gatewayProfiles,
  });
  const showMacRetryBanner = shouldShowMacRetryBanner({
    isDemo,
    macChatLive: effectiveMacChatLive,
    healthProbePending,
    runProgressFailed: runProgress?.phase === 'failed',
    heal: connectionHeal,
    userSendFailed,
  });
  const chatBlockingSurfaceOpen =
    sessionModalVisible ||
    toolsModalVisible ||
    macPickerVisible ||
    projectModalVisible ||
    renameModalVisible ||
    Boolean(messageDetail) ||
    Boolean(feedbackPrompt) ||
    showMacConnectionHelp;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !isDemo) {
        return undefined;
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (chatBlockingSurfaceOpen) {
          return false;
        }
        return true;
      });
      return () => subscription.remove();
    }, [chatBlockingSurfaceOpen, isDemo]),
  );

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
    if (isActiveChatRun(runProgress)) {
      return false;
    }
    if (messages.some((message) => message.role === 'user' && message.id?.startsWith('user-'))) {
      return false;
    }
    return true;
  }, [messages, pinnedOutboundText, isSending, runProgress]);

  const hasUserMessage = useMemo(() => hasUserMessageInTranscript(messages), [messages]);

  const showSubmittedPromptStrip = useMemo(() => {
    const promptText = pinnedOutboundText?.trim();
    if (!promptText) {
      return false;
    }
    return (
      isSending ||
      pinnedOutboundStatus !== 'sent' ||
      shouldShowSubmittedPromptStrip({ pinnedText: promptText, messages })
    );
  }, [pinnedOutboundText, pinnedOutboundStatus, isSending, messages]);

  const chatTimelineMessages = useMemo(
    () =>
      filterChatTimelineMessages({
        messages,
        includeToolActivity: false,
      }),
    [messages],
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
          scrollChatToLatestIfPinned(true);
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

  useEffect(() => {
    if (!macPickerVisible || isDemo) {
      return;
    }
    void probeTailscaleComputers();
  }, [macPickerVisible, isDemo, probeTailscaleComputers]);

  const handleSearchMacFromChat = useCallback(async () => {
    haptics.selection();
    setIsScanningMacs(true);
    try {
      const scanned = await scanForGatewayProfiles();

      const active = activeGatewayProfile;
      const isLoopbackActive = active ? isLoopbackGatewayUrl(active.gatewayUrl) : true;
      const isInvalidActive = active ? isInvalidGatewayProfile(active) : true;

      if (isInvalidActive || isLoopbackActive) {
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
    if (effectiveMacChatLive) {
      setErrorMessage((prev) => (prev && isConnectivityMessage(prev) ? null : prev));
    }
  }, [effectiveMacChatLive]);

  const activeProject = useMemo(() => {
    const activeId = resolveActiveProjectId(projectState, activeGatewayProfile?.id ?? null);
    if (!activeId) return null;
    return projectState.projects.find((p) => p.id === activeId) ?? null;
  }, [projectState, activeGatewayProfile?.id]);

  const contextProject = useMemo(
    () => resolveChatProject(projectState, currentSession?.id, activeGatewayProfile?.id ?? null),
    [projectState, currentSession?.id, activeGatewayProfile?.id],
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
        profiles: gatewayProfiles,
      }),
    [
      activeGatewayProfile,
      gatewayUrl,
      health,
      settings.connectionMode,
      isPaired,
      relayWorkers,
      activeRelayWorkerId,
      gatewayProfiles,
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

  const machineShortLabel = machineHeaderDisplay.machineLabel;
  const machineEndpoint = machineHeaderDisplay.machineEndpoint;

  const routeStatusLabel =
    settings.connectionMode === 'relay' &&
    !isPaired &&
    relayRouteDisplay.routeStatus !== 'Direct link'
      ? relayRouteDisplay.routeStatus
      : !effectiveMacHttpOk && connectionHealExhausted
        ? savedMacUnreachableStatus(machineShortLabel)
        : undefined;

  const macRetryBannerText = useMemo(() => {
    if (
      shouldShowActiveReconnectingCopy({
        macRetryBusy,
        healInFlight: connectionHealInFlight,
        healExhausted: connectionHealExhausted,
      })
    ) {
      return reconnectingToMacCopy(machineShortLabel);
    }
    if (connectionHealExhausted && !effectiveMacHttpOk) {
      return formatSavedMacUnreachableBanner({
        macLabel: machineHeaderDisplay.machineLabel,
        machineEndpoint: machineHeaderDisplay.machineEndpoint,
      });
    }
    return formatMacConnectionRetryBanner({
      connectionState,
      connectingStuck,
      gatewayUrl,
      health,
      activeProfile: activeGatewayProfile,
      profiles: gatewayProfiles,
      machineLabel: machineHeaderDisplay.machineLabel,
      machineEndpoint: machineHeaderDisplay.machineEndpoint,
      authMismatch: health?.authMismatch === true,
    });
  }, [
    macRetryBusy,
    connectionHealInFlight,
    connectionHealExhausted,
    effectiveMacHttpOk,
    machineShortLabel,
    connectionState,
    connectingStuck,
    gatewayUrl,
    health,
    activeGatewayProfile,
    gatewayProfiles,
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

  const threadCreatedLabel = useMemo(() => {
    if (!currentSession) {
      return null;
    }
    return formatSessionCreated(sessionCreatedValue(currentSession));
  }, [currentSession]);

  /** Lift composer above software keyboard; tab bar stays mounted (no height collapse). */
  const androidKeyboardMode = Constants.expoConfig?.android?.softwareKeyboardLayoutMode;
  const effectiveKeyboardInset = resolveEffectiveKeyboardInset(
    keyboardInset,
    keyboardScreenVisible,
    inputFocused,
    windowDimensions.height,
  );
  const composerDockSpacing = useMemo(
    () =>
      composerDockInsets(
        effectiveKeyboardInset,
        insets.bottom,
        androidKeyboardMode,
        keyboardWindowShrunk,
        effectiveKeyboardInset > 0 ? 0 : ANDROID_TAB_BAR_ESTIMATE_PX,
      ),
    [
      effectiveKeyboardInset,
      insets.bottom,
      androidKeyboardMode,
      keyboardWindowShrunk,
      composerLayoutNonce,
    ],
  );
  const keyboardOpen = effectiveKeyboardInset > 0;

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
    () =>
      buildMobileChatSystemPrompt(contextProject?.workspacePath, settings.hermesPersona, {
        vaultSlug: contextProject?.vaultSlug,
        handoffSummary: contextProject?.handoffSummary,
      }),
    [
      contextProject?.workspacePath,
      contextProject?.vaultSlug,
      contextProject?.handoffSummary,
      settings.hermesPersona,
    ],
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
        isSending,
        pinnedOutboundText,
        hasActiveRun: isActiveChatRun(runProgress),
        hasUserMessage,
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
      isSending,
      pinnedOutboundText,
      runProgress,
      hasUserMessage,
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
      return 'Message your computer…';
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
              id: 'demo-sample-project',
              name: 'Sample project',
              workspacePath: '~/projects/sample-project',
              vaultSlug: 'Sample',
              sessionIds: ['demo-1'],
              activeSessionId: 'demo-1',
            },
            {
              id: 'demo-thumbgate',
              name: 'ThumbGate',
              workspacePath: '~/projects/ThumbGate',
              vaultSlug: 'ThumbGate',
              sessionIds: ['demo-2'],
              activeSessionId: 'demo-2',
            },
          ],
          sessionProjectMap: { 'demo-1': 'demo-skool', 'demo-2': 'demo-thumbgate' },
          sessionLabels: {},
          activeProjectId: 'demo-skool',
          activeProjectByComputer: {},
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
    if (isDemo || !gatewayUrl.trim() || !macHttpOk) {
      return;
    }
    let cancelled = false;
    setVaultCatalogLoading(true);
    void (async () => {
      const catalog = await fetchVaultProjectCatalog(
        gatewayUrl,
        activeGatewayProfile?.localIp ? [activeGatewayProfile.localIp] : [],
      );
      if (cancelled) return;
      setVaultCatalog(catalog);
      setVaultCatalogLoading(false);
      if (!catalog?.projects.length) return;
      setProjectState((prev) => {
        const merged = mergeVaultCatalogIntoState(prev, catalog.projects);
        if (merged === prev) return prev;
        void chatProjects.save(merged);
        return merged;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [isDemo, gatewayUrl, macHttpOk, activeGatewayProfile?.id, activeGatewayProfile?.localIp]);

  // Dynamic sync from central Obsidian PROJECTS.md table
  useEffect(() => {
    if (isDemo || !gatewayUrl.trim() || !macHttpOk) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const obsidianProjects = await getObsidianProjects(gatewayUrl, apiKey);
        if (cancelled) return;
        if (obsidianProjects && obsidianProjects.length > 0) {
          setProjectState((prev) => {
            let stateChanged = false;
            const projects = [...prev.projects];
            for (const op of obsidianProjects) {
              const exists = projects.some(
                (p) => p.workspacePath.toLowerCase() === op.workspacePath.toLowerCase()
              );
              const cleanSlug = op.vaultHome.replace(/^Projects\//i, '').split('/')[0] || '';
              if (!exists) {
                const id = `proj_obsidian_${op.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                projects.push({
                  id,
                  name: op.name,
                  workspacePath: op.workspacePath,
                  vaultSlug: cleanSlug || undefined,
                  handoffSummary: op.rule || undefined,
                  sessionIds: [],
                });
                stateChanged = true;
              } else {
                const idx = projects.findIndex(
                  (p) => p.workspacePath.toLowerCase() === op.workspacePath.toLowerCase()
                );
                if (idx !== -1) {
                  const p = projects[idx]!;
                  if (p.vaultSlug !== cleanSlug || p.handoffSummary !== op.rule) {
                    projects[idx] = {
                      ...p,
                      vaultSlug: cleanSlug || undefined,
                      handoffSummary: op.rule || undefined,
                    };
                    stateChanged = true;
                  }
                }
              }
            }
            if (!stateChanged) return prev;
            const next = { ...prev, projects };
            void chatProjects.save(next);
            return next;
          });
        }
      } catch (err) {
        console.log('Failed to fetch Obsidian projects:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDemo, gatewayUrl, apiKey, macHttpOk]);

  useEffect(() => {
    if (!macHttpOk || isDemo) {
      setActiveAgents([]);
      return;
    }
    let cancelled = false;
    const fetchAgents = async () => {
      try {
        const agents = await getObsidianAgents(gatewayUrl, apiKey);
        if (cancelled) return;
        setActiveAgents(agents.map(a => ({ name: a.name, status: a.status })));
      } catch (err) {
        console.log('Failed to fetch active agents:', err);
      }
    };
    fetchAgents();
    const interval = setInterval(fetchAgents, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [macHttpOk, gatewayUrl, apiKey, isDemo]);

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
    const next = setActiveProjectForComputer(
      projectState,
      activeGatewayProfile?.id ?? null,
      project.id,
    );
    await persistProjectState(next);
    const boundSessionId = project.activeSessionId ?? project.sessionIds[0];
    if (boundSessionId) {
      const match = sessions.find((s) => s.id === boundSessionId);
      if (match) {
        setCurrentSession(match);
        setProjectModalVisible(false);
        return;
      }
    }
    setCurrentSession(null);
    setMessages([]);
    setProjectModalVisible(false);
  };

  const openProjectPicker = useCallback(() => {
    haptics.selection();
    setProjectSearchQuery('');
    setProjectModalVisible(true);
  }, []);

  const handlePickWorkspace = useCallback(() => {
    openProjectPicker();
  }, [openProjectPicker]);

  const handleSelectVaultProject = useCallback(
    (project: ChatProject) => {
      void selectProject(project);
    },
    [projectState, activeGatewayProfile?.id, sessions],
  );

  const handleClearProject = useCallback(async () => {
    haptics.selection();
    const next = setActiveProjectForComputer(
      projectState,
      activeGatewayProfile?.id ?? null,
      null,
    );
    await persistProjectState(next);
    setProjectModalVisible(false);
  }, [projectState, activeGatewayProfile?.id]);

  const handleAddProject = async () => {
    const path = newProjectPath.trim();
    if (!path) {
      setErrorMessage('Enter a workspace path (e.g. ~/projects/my-app)');
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
    options?: {
      silent?: boolean;
      projectState?: ChatProjectState;
      computerSessionKeys?: string[] | null;
    },
  ) => {
    const selectionProjectState = options?.projectState ?? projectState;
    const computerSessionKeys = options?.computerSessionKeys ?? activeComputerSessionKeys;
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

      const skipAutoSelect = skipSessionAutoSelectRef.current;
      if (skipAutoSelect) {
        skipSessionAutoSelectRef.current = false;
      }

      const selectableSessions = filterDismissedThreadSessions(finalSessions, {
        dismissedSessionIds: dismissedSessionIdsRef.current,
        hideCronSessions: hideCronSessionsRef.current,
      });
      const rememberedSessionId = await storage.loadLastSessionForComputer(computerSessionKeys);

      const resolvedSession = resolveSessionAfterListLoad({
        sessions: selectableSessions,
        projectState: selectionProjectState,
        currentSessionId: currentSessionRef.current?.id,
        manualSelectSessionId: manualSessionSelectRef.current,
        rememberedSessionId,
        skipAutoSelect,
        selectLatest,
      });

      if (resolvedSession !== undefined) {
        setCurrentSession(resolvedSession);
      }

      if (
        manualSessionSelectRef.current &&
        (resolvedSession === undefined
          ? currentSessionRef.current?.id === manualSessionSelectRef.current
          : resolvedSession?.id === manualSessionSelectRef.current)
      ) {
        manualSessionSelectRef.current = null;
      }
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
    if (isProjectsLoaded) {
      loadSessionsList(true);
    }
  }, [isProjectsLoaded, isDemo, gatewayUrl, apiKey, macChatLive]);

  useEffect(() => {
    const wasLive = prevMacChatLiveRef.current;
    prevMacChatLiveRef.current = macChatLive;
    if (isDemo || wasLive === null || wasLive || !macChatLive) {
      return;
    }
    void loadSessionsList(false, { silent: true }).then(() => {
      if (currentSessionRef.current) {
        void refreshSessionMessagesRef.current?.({ background: false, force: true });
      }
    });
  }, [macChatLive, isDemo]);

  useEffect(() => {
    if (isDemo || !currentSession?.id || activeComputerSessionKeys.length === 0) {
      return;
    }
    void storage.saveLastSessionForComputer(activeComputerSessionKeys, currentSession.id);
  }, [activeComputerSessionKeys, currentSession?.id, isDemo]);

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
    async (options?: { background?: boolean; manual?: boolean; force?: boolean }) => {
      const activeSession = currentSessionRef.current;
      if (!activeSession) {
        transcriptDigestRef.current = '';
        setMessages([]);
        return;
      }

      if (!macChatLive && !options?.force) {
        // Keep the transcript visible during transient disconnect; reload on reconnect.
        return;
      }

      if (refreshInFlightRef.current) {
        // Force/manual selects must not be dropped — empty-state Recents taps race background polls.
        if (options?.background || options?.manual || options?.force) {
          refreshQueuedRef.current = true;
          if (options?.force || options?.manual) {
            refreshQueuedForceRef.current = true;
          }
        }
        return;
      }
      refreshInFlightRef.current = true;
      const requestedSessionId = activeSession.id;

      const finishRefresh = () => {
        setIsLoadingMessages(false);
        setIsPullRefreshing(false);
        refreshInFlightRef.current = false;
        if (!refreshQueuedRef.current) {
          return;
        }
        refreshQueuedRef.current = false;
        const force = refreshQueuedForceRef.current;
        refreshQueuedForceRef.current = false;
        queueMicrotask(() => {
          void refreshSessionMessages(
            force ? { background: false, force: true } : { background: true },
          );
        });
      };

      const applyMergedMessages = (merged: HermesMessage[]) => {
        if (currentSessionRef.current?.id !== requestedSessionId) {
          return;
        }
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
        finishRefresh();
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
          if (currentSessionRef.current?.id !== requestedSessionId) {
            return;
          }
          applyMergedMessages(mergeWithLocalPending(dedupeChatMessages(tgMessages)));
          setTelegramReplySessionId(replySessionId);
          setTelegramInboxMeta({ threadCount, messageCap });
        } else {
          const history = await listMessages(gatewayUrl, activeSession.id, apiKey);
          if (currentSessionRef.current?.id !== requestedSessionId) {
            return;
          }
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
        if (currentSessionRef.current?.id === requestedSessionId) {
          applyChatApiError(err, 'Could not load messages from your computer.', options);
        }
      } finally {
        finishRefresh();
      }
    },
    [isDemo, gatewayUrl, apiKey, macChatLive, settings.includeToolActivity, applyChatApiError],
  );

  refreshSessionMessagesRef.current = refreshSessionMessages;

  const clearDeferredTelegramPoll = useCallback(() => {
    if (deferredTelegramPollRef.current) {
      clearInterval(deferredTelegramPollRef.current);
      deferredTelegramPollRef.current = null;
    }
    awaitingGatewayReplyRef.current = false;
    setAwaitingGatewayReply(false);
  }, []);

  const startDeferredReplyPoll = useCallback(
    (
      assistantId: string,
      priorAssistants: Set<string>,
      options?: { onTimeout?: () => void },
    ) => {
      clearDeferredTelegramPoll();
      awaitingGatewayReplyRef.current = true;
      setAwaitingGatewayReply(true);
      const startedAt = Date.now();
      deferredTelegramPollRef.current = setInterval(() => {
        if (Date.now() - startedAt > DEFERRED_REPLY_POLL_MAX_MS) {
          clearDeferredTelegramPoll();
          awaitingGatewayReplyRef.current = false;
          setAwaitingGatewayReply(false);
          setToolStatus(null);
          setRunProgress((prev) =>
            prev && prev.phase !== 'completed'
              ? { ...prev, phase: 'failed', detail: EMPTY_REPLY_FAILURE_REASON }
              : prev,
          );
          options?.onTimeout?.();
          return;
        }
        void refreshSessionMessages({ background: true, force: true }).then(() => {
          const reply = findNewAssistantReply(messagesRef.current, priorAssistants);
          if (!reply) {
            return;
          }
          clearDeferredTelegramPoll();
          awaitingGatewayReplyRef.current = false;
          setAwaitingGatewayReply(false);
          setToolStatus(null);
          setRunProgress(null);
          commitMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: reply } : m)),
          );
          haptics.success();
        });
      }, DEFERRED_REPLY_POLL_MS);
    },
    [clearDeferredTelegramPoll, commitMessages, refreshSessionMessages],
  );

  const startDeferredTelegramPoll = useCallback(
    (assistantId: string, priorAssistants: Set<string>) => {
      startDeferredReplyPoll(assistantId, priorAssistants);
    },
    [startDeferredReplyPoll],
  );

  useEffect(() => {
    return () => {
      clearDeferredTelegramPoll();
    };
  }, [clearDeferredTelegramPoll]);

  useEffect(() => {
    setChatStreamProgressActive(isSending || isChatStreamActive);
    if (!isSending && !isChatStreamActive) {
      sendProgressSnapshotRef.current = null;
    }
  }, [isSending, isChatStreamActive, setChatStreamProgressActive]);

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
      setPinnedOutboundSentAt(null);
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
      setPinnedOutboundSentAt(null);
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
    setInputFocused(true);
    if (Platform.OS === 'android') {
      setKeyboardScreenVisible(true);
      setComposerLayoutNonce((n) => n + 1);
    }
  }, []);

  const handleInputBlur = useCallback(() => {
    inputFocusedRef.current = false;
    setInputFocused(false);
    if (Platform.OS === 'android') {
      setKeyboardScreenVisible(false);
    }
    const sessionId = currentSessionRef.current?.id;
    if (sessionId && !isDemo) {
      void saveComposerDraft(sessionId, inputValueRef.current);
    }
    if (pendingTranscriptSyncRef.current) {
      pendingTranscriptSyncRef.current = false;
      void refreshSessionMessages({ background: true });
    }
  }, [refreshSessionMessages, isDemo]);

  useEffect(() => {
    setUndoSecondsLeft(0);
    const hasActiveOutbound =
      pendingOutboundSendsRef.current > 0 || isSendingRef.current;
    const hasActiveRun = isActiveChatRun(runProgressRef.current);
    if (hasActiveOutbound || hasActiveRun) {
      return;
    }
    setPinnedOutboundText(null);
    setPinnedOutboundSentAt(null);
    setPinnedOutboundStatus('pending');
    setRunProgress(null);
    transcriptDigestRef.current = '';
    messagesRef.current = [];
    setMessages([]);
    pinScrollAfterHydrationRef.current = true;
    userScrolledUpRef.current = false;
    lastDistanceFromBottomRef.current = 0;
    void refreshSessionMessagesRef.current?.({
      background: false,
      force: manualSessionSelectRef.current === currentSession?.id,
    });
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
      void (async () => {
        const progress = runProgressRef.current;
        const lastActiveRaw = activeSession.last_active;
        const lastActiveUnix =
          typeof lastActiveRaw === 'number'
            ? lastActiveRaw
            : typeof lastActiveRaw === 'string' && lastActiveRaw.trim()
              ? Number(lastActiveRaw)
              : null;
        const knownRunIds = [
          progress?.runId,
          sendProgressSnapshotRef.current?.runId,
        ].filter((id): id is string => Boolean(id?.trim()));
        const action = await reconcileFrozenSessionBusyState(
          gatewayUrl,
          apiKey,
          progress,
          isSendingRef.current,
          knownRunIds,
          Number.isFinite(lastActiveUnix) ? lastActiveUnix : null,
        );
        if (action !== 'clear') {
          return;
        }
        isSendingRef.current = false;
        setIsSending(false);
        setRunProgress(null);
        failPendingOutboundBubbles(OUTBOUND_STUCK_FAILURE_REASON);
        void refreshSessionMessagesRef.current?.({ background: true, force: true });
      })();
    }, [
      apiKey,
      currentSession?.id,
      currentSession?.last_active,
      failPendingOutboundBubbles,
      gatewayUrl,
      isDemo,
      macChatLive,
      macHttpOk,
      connectionState,
      connectEvents,
      setRunProgress,
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
    const shouldPoll =
      isTelegramView || connectionState !== 'connected' || awaitingGatewayReply;
    if (!shouldPoll) {
      return;
    }
    const intervalMs = awaitingGatewayReply
        ? DEFERRED_REPLY_POLL_MS
        : isTelegramView
          ? connectionState === 'connected'
            ? 5000
            : 4000
          : connectionState === 'connected'
            ? 12000
            : 8000;
    const timer = setInterval(() => {
      refreshSessionMessagesRef.current?.({ background: true });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [currentSession?.id, isDemo, macChatLive, isTelegramView, connectionState, awaitingGatewayReply]);

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
    setPinnedOutboundSentAt(null);
    setPinnedOutboundStatus('pending');
    setErrorMessage((prev) => (prev && isConnectivityMessage(prev) ? null : prev));

    const activeProfileId = activeGatewayProfile?.id ?? null;

    try {
      if (activeProfileId) {
        await selectGatewayProfile(activeProfileId);
      }

      let nextSettings = settings;
      if (settings.connectionMode !== 'gateway') {
        nextSettings = { ...settings, connectionMode: 'gateway' as const };
        await saveSettings(nextSettings, apiKey);
      }

      if (health?.authMismatch) {
        const pairHost = pairServerHostFromGatewayUrl(
          effectiveGatewayUrl || nextSettings.gatewayUrl,
        );
        if (pairHost) {
          const setup = await resolvePairServerSetupParams(pairHost);
          const freshKey = setup?.apiKey?.trim();
          if (freshKey) {
            const gatewayUrl = setup?.gatewayUrl?.trim() || effectiveGatewayUrl;
            nextSettings = { ...nextSettings, gatewayUrl };
            await saveSettings(nextSettings, freshKey);
          }
        }
      }

      await scanForGatewayProfiles();
      await autoConnectGateway();
      await retryGatewayBootstrap();
      await refreshHealth();
      connectEvents();

      const profileKey = await secureCredentials.resolveApiKeyForProfile(activeProfileId);
      const probeUrl = effectiveGatewayUrl || settings.gatewayUrl;
      const postRetryHealth = await fetchGatewayHealth(probeUrl, profileKey);
      if (postRetryHealth.authMismatch) {
        setMacPickerVisible(true);
        setErrorMessage(gatewayAuthRepairBanner(machineShortLabel));
        haptics.warning();
        return;
      }

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
    health?.authMismatch,
    effectiveGatewayUrl,
    saveSettings,
    gatewayProfiles,
    activeGatewayProfile?.id,
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
    const stickToBottom = shouldAutoScroll(
      lastDistanceFromBottomRef.current,
      isSending,
      userScrolledUpRef.current,
    );
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
    userScrolledUpRef.current = false;
    lastDistanceFromBottomRef.current = 0;
    setChatNearBottom(true);
    scrollChatToLatest(false);
    const retryTimer = setTimeout(() => scrollChatToLatest(false), 200);
    return () => clearTimeout(retryTimer);
  }, [activeGatewayProfile?.id, currentSession?.id, isLoadingMessages, scrollChatToLatest]);

  useEffect(() => {
    if (isLoadingMessages || messages.length === 0) {
      return;
    }
    if (userScrolledUpRef.current) {
      return;
    }
    scrollChatToLatestIfPinned(true, isChatStreamingActive());
  }, [messages, isSending, runProgress, isLoadingMessages, scrollChatToLatestIfPinned, isChatStreamingActive]);

  const handleNewChat = async () => {
    haptics.selection();
    setSessionModalVisible(false);
    setRecentChatsDismissed(true);
    setErrorMessage(null);
    setMessages([]);
    setPinnedOutboundText(null);
    setPinnedOutboundSentAt(null);
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

  const handleStartFreshChat = useCallback(async () => {
    haptics.selection();
    isSendingRef.current = false;
    setIsSending(false);
    setRunProgress(null);
    failPendingOutboundBubbles('Started fresh chat');
    setPinnedOutboundText(null);
    setPinnedOutboundSentAt(null);
    setPinnedOutboundStatus('pending');
    setErrorMessage(null);
    setMessages([]);
    messagesRef.current = [];
    transcriptDigestRef.current = '';
    setToolStatus(null);
    setRecentChatsDismissed(true);

    const sourceSession = currentSessionRef.current;
    if (isDemo || !sourceSession || isTelegramInboxSession(sourceSession)) {
      await handleNewChat();
      return;
    }

    try {
      const forked = await forkSession(gatewayUrl, sourceSession.id, apiKey);
      const forkId = forked.session_id?.trim();
      if (!forkId) {
        throw new Error('Could not fork chat on your computer');
      }
      const baseTitle = sourceSession.title?.trim() || 'Chat';
      const freshSession = ensureSessionCreatedAt({
        id: forkId,
        title: `${baseTitle} (fresh)`,
        model: sourceSession.model,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        last_active_at: new Date().toISOString(),
      });
      setSessions((prev) => [freshSession, ...prev.filter((session) => session.id !== forkId)]);
      setCurrentSession(freshSession);
      if (activeProject) {
        const next = bindSessionToProject(projectState, activeProject.id, forkId, freshSession.title ?? baseTitle);
        await persistProjectState(next);
      }
      void refreshSessionMessagesRef.current?.({ background: false, force: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not start a fresh chat on your computer',
      );
      await handleNewChat();
    }
  }, [
    activeProject,
    apiKey,
    failPendingOutboundBubbles,
    gatewayUrl,
    handleNewChat,
    isDemo,
    persistProjectState,
    projectState,
    setRunProgress,
  ]);

  const confirmMegaSessionSend = useCallback(async (): Promise<boolean> => {
    const session = currentSessionRef.current;
    const level = classifyMegaSession(session);
    if (level === 'normal') {
      return true;
    }
    const total = sessionTotalTokens(session);
    if (level === 'block') {
      await new Promise<void>((resolve) => {
        Alert.alert('Chat too large', megaSessionSendBlockedCopy(total), [
          { text: 'Start fresh chat', onPress: () => void handleStartFreshChat() },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
        ]);
      });
      return false;
    }
    return new Promise<boolean>((resolve) => {
      Alert.alert(megaSessionSendWarnTitle(), megaSessionSendWarnMessage(total), [
        { text: 'Start fresh chat', onPress: () => void handleStartFreshChat().then(() => resolve(false)) },
        { text: 'Send anyway', style: 'destructive', onPress: () => resolve(true) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      ]);
    });
  }, [handleStartFreshChat]);

  const megaSessionWarning = useMemo(() => {
    if (!isMegaSession(currentSession)) {
      return null;
    }
    return megaSessionBannerCopy(sessionTotalTokens(currentSession));
  }, [currentSession]);

  const executeClearAllChats = useCallback(async () => {
    haptics.warning();
    setIsClearing(true);

    // Drop transcript immediately so a slow gateway reload cannot flash old messages.
    skipSessionAutoSelectRef.current = true;
    manualSessionSelectRef.current = null;
    setCurrentSession(null);
    setMessages([]);
    messagesRef.current = [];
    transcriptDigestRef.current = '';
    setTelegramReplySessionId('');
    setRecentChatsDismissed(true);

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
      try {
        await clearAllSessions(gatewayUrl, apiKey);
      } catch (err) {
        console.warn('[executeClearAllChats] API clear-all failed, falling back to sequential deletes:', err);
        for (const session of deletable) {
          try {
            await deleteSession(gatewayUrl, session.id, apiKey);
          } catch {
            failed += 1;
          }
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

      skipSessionAutoSelectRef.current = true;
      await loadSessionsList(false, { silent: true, projectState: nextState });

      dismissedHydrationGenRef.current += 1;
      setDismissedSessionIds(nextDismissed);
      setSessions((prev) => applyClearedFilter(prev));
      if (failed > 0) {
        setErrorMessage(
          `${failed} thread${failed === 1 ? '' : 's'} could not be deleted on your computer. The rest were cleared.`,
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
      'This deletes every thread on your computer from Hermes. You cannot undo this.',
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
  const composerAttachmentsRef = useRef(composerAttachments);
  composerAttachmentsRef.current = composerAttachments;

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
    const sessionId = currentSessionRef.current?.id;
    if (!sessionId || isDemo) {
      return;
    }
    if (composerDraftSaveTimerRef.current) {
      clearTimeout(composerDraftSaveTimerRef.current);
    }
    composerDraftSaveTimerRef.current = setTimeout(() => {
      composerDraftSaveTimerRef.current = null;
      void saveComposerDraft(sessionId, text);
    }, COMPOSER_DRAFT_SAVE_DEBOUNCE_MS);
  }, [isDemo]);

  const flushComposerDraft = useCallback(() => {
    if (composerDraftSaveTimerRef.current) {
      clearTimeout(composerDraftSaveTimerRef.current);
      composerDraftSaveTimerRef.current = null;
    }
    const sessionId = currentSessionRef.current?.id;
    if (sessionId && !isDemo) {
      void saveComposerDraft(sessionId, inputValueRef.current);
    }
  }, [isDemo]);

  useEffect(() => {
    const sessionId = currentSession?.id ?? null;
    const previousSessionId = composerDraftSessionRef.current;
    if (previousSessionId && previousSessionId !== sessionId) {
      void saveComposerDraft(previousSessionId, inputValueRef.current);
    }
    composerDraftSessionRef.current = sessionId;

    if (!sessionId || isDemo || pendingApprovalEditSeed) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const draft = await loadComposerDraft(sessionId);
      if (cancelled || pendingApprovalEditSeed) {
        return;
      }
      inputValueRef.current = draft;
      setInputValue(draft);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentSession?.id, isDemo, pendingApprovalEditSeed]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        flushComposerDraft();
      }
    });
    return () => sub.remove();
  }, [flushComposerDraft]);

  useEffect(() => {
    return () => {
      flushComposerDraft();
    };
  }, [flushComposerDraft]);

  const handleAttachPress = useCallback(() => {
    const remainingSlots = MAX_COMPOSER_ATTACHMENTS - composerAttachmentsRef.current.length;
    if (remainingSlots <= 0) {
      setErrorMessage(`You can attach up to ${MAX_COMPOSER_ATTACHMENTS} files.`);
      haptics.warning();
      return;
    }
    Alert.alert('Attach', undefined, [
      {
        text: 'Photo library',
        onPress: () => {
          void (async () => {
            const picked = await pickImageAttachments(remainingSlots);
            if (picked.error) {
              setErrorMessage(picked.error);
              haptics.warning();
              return;
            }
            if (picked.attachments.length > 0) {
              setComposerAttachments((prev) => [...prev, ...picked.attachments]);
              haptics.light();
            }
          })();
        },
      },
      {
        text: 'File',
        onPress: () => {
          void (async () => {
            const picked = await pickDocumentAttachments(remainingSlots);
            if (picked.error) {
              setErrorMessage(picked.error);
              haptics.warning();
              return;
            }
            if (picked.attachments.length > 0) {
              setComposerAttachments((prev) => [...prev, ...picked.attachments]);
              haptics.light();
            }
          })();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setComposerAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
    haptics.selection();
  }, []);

  const handleSendMessage = async (composerLatest?: string) => {
    const attachments = [...composerAttachmentsRef.current];
    const composerText = composerLatest ?? inputValueRef.current;
    const action = resolveComposerSendAction({
      composerText,
      lastFailedText: lastFailedOutboundText ?? lastFailedSendTextRef.current,
      isDemo,
      macChatLive,
    });

    if (action.kind === 'retry_reconnect') {
      haptics.selection();
      await handleMacRetry();
      return;
    }

    if (action.kind === 'retry_resend') {
      haptics.selection();
      setErrorMessage(null);
      if (runProgressRef.current?.phase === 'failed') {
        setRunProgress(null);
      }
      const accepted = await sendUserText(action.text, true);
      if (accepted) {
        haptics.light();
      }
      return;
    }

    if (action.kind === 'none' && !composerHasSendableContent(composerText, attachments)) {
      return;
    }

    const userText = action.kind === 'send' ? action.text : composerText.trim();

    const displayText = formatAttachmentBubbleText(userText, attachments);
    lastSentComposerTextRef.current = displayText;
    sendClearSuppressRef.current = true;
    inputValueRef.current = '';
    setInputValue('');
    setComposerAttachments([]);
    Keyboard.dismiss();
    const sentSessionId = currentSessionRef.current?.id;
    if (sentSessionId && !isDemo) {
      void clearComposerDraft(sentSessionId);
    }

    const prepared =
      attachments.length === 0
        ? { content: userText.trim() as ChatMessageContent }
        : await prepareChatMessageContent(userText, attachments);
    if (prepared.error) {
      setErrorMessage(prepared.error);
      haptics.warning();
      sendClearSuppressRef.current = false;
      lastSentComposerTextRef.current = '';
      inputValueRef.current = userText;
      setInputValue(userText);
      setComposerAttachments(attachments);
      return;
    }

    const accepted = await sendUserText(userText, false, {
      gatewayContent: prepared.content,
      displayText,
      attachments,
    });
    if (!accepted) {
      sendClearSuppressRef.current = false;
      lastSentComposerTextRef.current = '';
      inputValueRef.current = userText;
      setInputValue(userText);
      setComposerAttachments(attachments);
    } else {
      haptics.light();
    }
  };

  const handleSendMessageRef = useRef(handleSendMessage);
  handleSendMessageRef.current = handleSendMessage;

  const handleSubmit = useCallback((latestText?: string) => {
    const text = (latestText ?? inputValueRef.current).trim();
    if (text || composerHasSendableContent(text, composerAttachmentsRef.current)) {
      void handleSendMessageRef.current(latestText);
      return;
    }
    void handleSendMessageRef.current(latestText);
  }, []);

  const handleSend = useCallback((latestText?: string) => {
    void handleSendMessageRef.current(latestText);
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
      return submitChatOutputFeedback(message, signal, {
        session: currentSession,
        explanation,
      });
    },
    [currentSession, submitChatOutputFeedback],
  );

  const setTransientFeedbackNote = useCallback((key: string, text: string, error: boolean) => {
    setFeedbackNotes((prev) => ({ ...prev, [key]: { text, error } }));
    setTimeout(() => {
      setFeedbackNotes((prev) => {
        if (!prev[key]) {
          return prev;
        }
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, FEEDBACK_NOTE_TTL_MS);
  }, []);

  const handleChatOutputFeedbackTap = useCallback(
    (message: HermesMessage, signal: 'up' | 'down') => {
      const key = resolveChatOutputFeedbackBusyKey(message);
      // Highlight the tapped thumb; user can switch up<->down freely.
      setFeedbackSelections((prev) => ({ ...prev, [key]: signal }));
      // Always record the vote to ThumbGate. The explanation sheet is now
      // opt-in (via the "Add details" link), not auto-opened on every tap.
      void submitChatOutputFeedbackForMessage(message, signal).then((ok) => {
        setTransientFeedbackNote(key, ok ? 'Saved to ThumbGate' : 'Not recorded', !ok);
      });
    },
    [submitChatOutputFeedbackForMessage, setTransientFeedbackNote],
  );

  const handleAddFeedbackDetails = useCallback(
    (message: HermesMessage) => {
      const key = resolveChatOutputFeedbackBusyKey(message);
      const signal = feedbackSelections[key];
      if (!signal) {
        return;
      }
      setFeedbackPrompt({ message, signal });
    },
    [feedbackSelections],
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
    ({ item, index }: { item: ChatTimelineEntry; index: number }) => {
      const { message, originalIndex } = item;
      const inlineNudge = inlineTextApprovals.get(originalIndex);
      const isStreamingAssistant =
        isSending &&
        message.role?.toLowerCase() === 'assistant' &&
        originalIndex === messages.length - 1;
      const showOutputFeedback = shouldShowChatOutputFeedback(message, {
        leashUnlocked,
        isStreamingAssistant,
      });
      const busyKey = resolveChatOutputFeedbackBusyKey(message);
      const feedbackNote = feedbackNotes[busyKey];
      const outputFeedback = showOutputFeedback
        ? {
            busy: chatOutputFeedbackBusyId === busyKey,
            selected: feedbackSelections[busyKey],
            onThumbsUp: () => handleChatOutputFeedbackTap(message, 'up'),
            onThumbsDown: () => handleChatOutputFeedbackTap(message, 'down'),
            onAddDetails: () => handleAddFeedbackDetails(message),
            note: feedbackNote?.text,
            noteIsError: feedbackNote?.error,
          }
        : undefined;
      return (
        <ChatMessageListItem
          item={message}
          listIndex={index}
          originalIndex={originalIndex}
          messages={messages}
          timeLabel={formatMessageTimestamp(resolveMessageTimestamp(message))}
          inlineNudge={inlineNudge}
          includeToolActivity={settings.includeToolActivity ?? false}
          isTelegramInbox={isTelegramInbox}
          connectionState={connectionState}
          macHttpOk={effectiveMacHttpOk}
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
      effectiveMacHttpOk,
      approvalBusy,
      isSending,
      leashUnlocked,
      chatOutputFeedbackBusyId,
      feedbackSelections,
      feedbackNotes,
      handleChatOutputFeedbackTap,
      handleAddFeedbackDetails,
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
    const sentAt = new Date().toISOString();
    const userMessage: HermesMessage = {
      id: `user-${Date.now()}-${outboundMessageSeqRef.current}`,
      role: 'user',
      content: trimmed,
      created_at: sentAt,
      outboundStatus: 'pending',
    };
    pendingOutboundSendsRef.current += 1;
    commitMessages((prev) => [...prev, userMessage]);
    setRecentChatsDismissed(true);
    setPinnedOutboundText(trimmed);
    setPinnedOutboundSentAt(sentAt);
    setPinnedOutboundStatus('pending');
    setToolStatus(null);
    userScrolledUpRef.current = false;
    lastDistanceFromBottomRef.current = 0;
    setChatNearBottom(true);
    scrollChatToLatest(true);
    return userMessage.id ?? '';
  };

  async function sendUserText(
    userText: string,
    isProgrammatic = false,
    outboundExtras?: {
      gatewayContent?: ChatMessageContent;
      displayText?: string;
      attachments?: ComposerAttachment[];
    },
  ): Promise<boolean> {
    const typed = userText.trim();
    const attachments = outboundExtras?.attachments ?? [];
    const displayText = outboundExtras?.displayText?.trim() ?? typed;
    const gatewayMessage = outboundExtras?.gatewayContent ?? typed;
    if (!displayText) return false;

    if (!isProgrammatic && !isDemo) {
      const session = currentSessionRef.current;
      const megaLevel = classifyMegaSession(session);
      if (megaLevel !== 'normal') {
        const allowed = await confirmMegaSessionSend();
        if (!allowed) {
          return false;
        }
      }
    }

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

    // Mark a session id the gateway rejected as removed and drop it from the
    // local cache so the picker/resume logic never offers a dead thread again.
    // Kept local so we don't stomp a freshly-surfaced error banner; the picker
    // refetches from the gateway the next time it opens.
    const invalidateRemovedSession = (sessionId: string | undefined | null) => {
      const id = sessionId?.trim();
      if (!id) {
        return;
      }
      removedSessionIdsRef.current.add(id);
      setSessions((prev) => prev.filter((session) => session.id !== id));
    };
    // Set when a send dead-ends on a removed session so the finally block does
    // not immediately reload a stale transcript over the surfaced error.
    let suppressPostSendRefresh = false;

    const notifyWaitingForMacSlot = (context?: { hasLiveRun?: boolean }) => {
      if (context?.hasLiveRun === false) {
        return;
      }
      setRunProgress((prev) =>
        prev
          ? { ...prev, detail: WAITING_FOR_PRIOR_CHAT_DETAIL }
          : {
              phase: 'sending',
              startedAtMs: Date.now(),
              detail: WAITING_FOR_PRIOR_CHAT_DETAIL,
            },
      );
    };

    const typedUpper = typed.toUpperCase();
    const firstPromptThreadTitle =
      deriveThreadTitleFromMessage(typed) ??
      attachments[0]?.name ??
      activeProject?.name ??
      'New chat';

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

    if (!isDemo && macChatLive) {
      const staleProgress = runProgressRef.current;
      if (staleProgress && isActiveChatRun(staleProgress)) {
        const staleAction = await reconcileStaleActiveRunProgress(
          gatewayUrl,
          apiKey,
          staleProgress,
          collectRecoveryRunIds(),
        );
        if (staleAction === 'clear') {
          setRunProgress(null);
        }
      }
      setErrorMessage((prev) =>
        prev?.toLowerCase().includes('still on the previous chat') ? null : prev,
      );
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
      setPinnedOutboundSentAt(null);
      outboundUserBubbleCommitted = false;
      committedUserMessageId = null;
    };

    committedUserMessageId = commitOutboundUserBubble(displayText);
    outboundUserBubbleCommitted = true;

    sendStartedAtRef.current = Date.now();
    const earlyProgressSessionId = isTelegramInboxSession(currentSession)
      ? telegramReplySessionId
      : currentSession?.id;
    setRunProgress((prev) => {
      const base: RunProgressState =
        prev && isActiveChatRun(prev)
          ? {
              ...prev,
              phase: 'sending',
              startedAtMs: sendStartedAtRef.current,
              detail: 'Delivering your message…',
              sessionId: earlyProgressSessionId ?? prev.sessionId,
            }
          : {
              phase: 'sending',
              startedAtMs: sendStartedAtRef.current,
              detail: 'Delivering your message…',
              sessionId: earlyProgressSessionId,
            };
      if (currentSession) {
        return mergeSessionUsageIntoRunProgress(base, currentSession, 'Delivering your message…');
      }
      return base;
    });

    // A gateway restart drops in-memory session ids; never carry a known-removed
    // id into a send (even on a "New chat") — clear it so we start fresh.
    if (currentSession && !isDemo && removedSessionIdsRef.current.has(currentSession.id)) {
      setCurrentSession(null);
    }
    let activeSess =
      currentSession && !isDemo && removedSessionIdsRef.current.has(currentSession.id)
        ? null
        : currentSession;
    const createdNewSession = !activeSess;
    if (!activeSess) {
      if (isDemo) {
        const demoTitle = titleFromFirstPrompt(userText) ?? GENERIC_NEW_SESSION_TITLE;
        activeSess = {
          id: `demo-${Date.now()}`,
          title: demoTitle,
          created_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
        };
        setSessions([activeSess]);
        setCurrentSession(activeSess);
      } else {
        const resumable = findResumableSessionByPromptTitle(
          sessionsRef.current.filter(
            (session) =>
              !isTelegramInboxSession(session) && !removedSessionIdsRef.current.has(session.id),
          ),
          userText,
        );
        if (resumable) {
          activeSess = ensureSessionCreatedAt(resumable);
          setCurrentSession(activeSess);
        } else {
          const placeholderTitle = firstPromptThreadTitle;
          await releaseMacOperatorSlot(gatewayUrl, apiKey, collectRecoveryRunIds());
          try {
            activeSess = await retryOnSessionInUse(
              gatewayUrl,
              apiKey,
              collectRecoveryRunIds,
              () =>
                createSessionWithUniqueTitle(
                  gatewayUrl,
                  apiKey,
                  placeholderTitle,
                  mobileChatSystemPrompt,
                ),
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
                    activeSess = ensureSessionCreatedAt({
                      id: forkId,
                      title: placeholderTitle,
                      last_active_at: new Date().toISOString(),
                    });
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
          activeSess = ensureSessionCreatedAt(activeSess);
          setSessions((prev) => [activeSess!, ...prev.filter((session) => session.id !== activeSess!.id)]);
          setCurrentSession(activeSess);
        }
      }
    }

    let sessionBindingPersisted = false;

    if (activeSess && !isProgrammatic) {
      const derived = titleFromFirstPrompt(userText);
      if (
        derived &&
        (isDemo || shouldAutoTitleSession(activeSess, projectState.sessionLabels))
      ) {
        const titled = ensureSessionCreatedAt({ ...activeSess, title: derived });
        activeSess = titled;
        setSessions((prev) =>
          prev.map((session) => (session.id === titled.id ? titled : session)),
        );
        setCurrentSession(titled);
        const nextState = activeProject
          ? bindSessionToProject(projectState, activeProject.id, titled.id, derived)
          : pinSessionLabel(projectState, titled.id, derived);
        await persistProjectState(nextState);
        sessionBindingPersisted = true;
        if (!isDemo) {
          void updateSessionTitle(gatewayUrl, titled.id, derived, apiKey).catch(() => {});
        }
      } else {
        const stamped = ensureSessionCreatedAt(activeSess);
        if (stamped !== activeSess) {
          activeSess = stamped;
          setSessions((prev) =>
            prev.map((session) => (session.id === stamped.id ? stamped : session)),
          );
          setCurrentSession(stamped);
        }
      }
    } else if (activeSess) {
      activeSess = ensureSessionCreatedAt(activeSess);
    }

    if (createdNewSession && activeSess && !isDemo && !sessionBindingPersisted && activeProject) {
      const next = bindSessionToProject(
        projectState,
        activeProject.id,
        activeSess.id,
        activeSess.title ?? GENERIC_NEW_SESSION_TITLE,
      );
      await persistProjectState(next);
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
        setPinnedOutboundSentAt(null);
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
              detail: 'Hermes is working on your computer…',
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
              detail: 'Hermes is working on your computer…',
            }
          : {
              phase: 'working',
              startedAtMs: sendStartedAtRef.current,
              detail: 'Hermes is working on your computer…',
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
        let mobileSess = ensureSessionCreatedAt(
          await createSessionWithUniqueTitle(
            gatewayUrl,
            apiKey,
            GENERIC_NEW_SESSION_TITLE,
            mobileChatSystemPrompt,
          ),
        );
        const derived = titleFromFirstPrompt(userText);
        if (derived) {
          mobileSess = { ...mobileSess, title: derived };
          void updateSessionTitle(gatewayUrl, mobileSess.id, derived, apiKey).catch(() => {});
          const nextState = activeProject
            ? bindSessionToProject(projectState, activeProject.id, mobileSess.id, derived)
            : pinSessionLabel(projectState, mobileSess.id, derived);
          await persistProjectState(nextState);
        }
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
      setIsChatStreamActive(true);
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
        if (!assistantBubbleAdded && isDeferredStreamPlaceholder(body)) {
          const existing = findDeferredPlaceholderAfterLastUser(messagesRef.current);
          if (existing?.id) {
            assistantBubbleAdded = true;
            activeAssistantIdRef.current = existing.id;
            commitMessages((prev) =>
              prev.map((m) => (m.id === existing.id ? { ...m, content: body } : m)),
            );
            scrollChatToLatestIfPinned(true);
            return;
          }
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
          scrollChatToLatestIfPinned(true);
          return;
        }
        commitMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: body } : m)),
        );
        scrollChatToLatestIfPinned(true);
      };

      let switchedSessionId = targetSessionId;
      let assistantText = '';
      let streamAccepted = false;
      const streamChatToSession = (streamTargetSessionId: string) => {
        switchedSessionId = streamTargetSessionId;
        return retryOnSessionInUse(
          gatewayUrl,
          apiKey,
          collectRecoveryRunIds,
          () =>
            streamSessionChat(
          gatewayUrl,
          streamTargetSessionId,
          gatewayMessage,
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
                return attachRunMetadata(
                  mergeRunUsageFromPayload(
                    {
                      ...prev,
                      phase: failed ? 'failed' : 'completed',
                      detail: failed
                        ? String(evt.data?.error || 'Run ended with error')
                        : 'Task completed',
                    },
                    evt.data,
                  ),
                  evt.data,
                  prev,
                );
              });
              if (!failed) {
                setOperatorTerminalLine(null);
              }
            } else if (
              eventName === 'run.started' ||
              eventName === 'message.started' ||
              eventName === 'tool.progress' ||
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
                const merged = attachRunMetadata(next, evt.data, prev);
                if (runProgressForDisplayEqual(prev, merged)) {
                  return prev;
                }
                return merged;
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
            streamAccepted = true;
            markMessageDeliveredToMac();
            releaseOutboundSendLock();
            setRunProgress((prev) =>
              prev
                ? {
                    ...prev,
                    phase: 'working',
                    detail: 'Hermes is working on your computer…',
                  }
                : {
                    phase: 'working',
                    startedAtMs: sendStartedAtRef.current,
                    detail: 'Hermes is working on your computer…',
                    sessionId: targetSessionIdForProgress,
                  },
            );
          },
        ),
          notifyWaitingForMacSlot,
        );
      };

      // Create a fresh session and rebind chat state to it — used to self-heal
      // when the gateway reports the target session was removed/restarted.
      const recoverWithFreshSession = async (staleSessionId: string): Promise<boolean> => {
        invalidateRemovedSession(staleSessionId);
        let fresh: HermesSession;
        try {
          fresh = ensureSessionCreatedAt(
            await retryOnSessionInUse(
              gatewayUrl,
              apiKey,
              collectRecoveryRunIds,
              () =>
                createSessionWithUniqueTitle(
                  gatewayUrl,
                  apiKey,
                  firstPromptThreadTitle,
                  mobileChatSystemPrompt,
                ),
              notifyWaitingForMacSlot,
            ),
          );
        } catch {
          return false;
        }
        activeSess = fresh;
        targetSessionId = fresh.id;
        setSessions((prev) => [
          fresh,
          ...prev.filter((s) => s.id !== fresh.id && s.id !== staleSessionId),
        ]);
        setCurrentSession(fresh);
        setErrorMessage((prev) => (prev?.includes('That chat was removed') ? null : prev));
        if (activeProject) {
          const nextState = bindSessionToProject(
            projectState,
            activeProject.id,
            fresh.id,
            fresh.title ?? firstPromptThreadTitle,
          );
          await persistProjectState(nextState);
        }
        return true;
      };

      let removedSessionRecoveryAttempted = false;
      try {
        assistantText = await streamChatToSession(targetSessionId);
      } catch (streamErr) {
        const streamMessage =
          streamErr instanceof Error ? streamErr.message : String(streamErr);
        const streamStatus =
          streamErr instanceof HermesGatewayApiError ? streamErr.status : 0;
        const sessionRemoved =
          !isTelegramInboxSession(activeSess) &&
          (isSessionRemovedError(streamErr) || streamStatus === 404);
        const shouldFallback =
          isSessionInUseError(streamErr) ||
          streamStatus >= 400 ||
          streamMessage.includes('Network request failed') ||
          streamMessage.includes('Failed to fetch') ||
          streamMessage.toLowerCase().includes('timed out') ||
          streamMessage.toLowerCase().includes('stalled') ||
          streamMessage.includes('AbortError') ||
          streamMessage.toLowerCase().includes('connection error');

        if (sessionRemoved && !removedSessionRecoveryAttempted) {
          removedSessionRecoveryAttempted = true;
          const staleSessionId = targetSessionId;
          const recovered = await recoverWithFreshSession(staleSessionId);
          if (!recovered) {
            throw streamErr;
          }
          // Retry the send once against the fresh session. If this also fails,
          // let it surface through the outer catch (the visible error).
          assistantText = await streamChatToSession(targetSessionId);
          updateAssistant(assistantText);
        } else if (streamAccepted && shouldFallback) {
          // User message already reached the Mac; polling beats re-sending and duplicating turns.
          assistantText = '';
        } else if (shouldFallback) {
          const response = await retryOnSessionInUse(
            gatewayUrl,
            apiKey,
            collectRecoveryRunIds,
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
                  detail: 'Queued on Hermes thread — your computer may still be running tools',
                }
              : prev,
          );
          startDeferredTelegramPoll(assistantId, priorAssistants);
        } else if (
          shouldAwaitGatewayReplyAfterSend({
            assistantText,
            streamAccepted,
            streamFailed: false,
          })
        ) {
          setToolStatus('Waiting for reply from your computer…');
          setRunProgress((prev) =>
            prev
              ? {
                  ...prev,
                  phase: 'working',
                  detail: 'Your computer is still working — fetching reply…',
                }
              : {
                  phase: 'working',
                  startedAtMs: sendStartedAtRef.current,
                  detail: 'Your computer is still working — fetching reply…',
                  sessionId: targetSessionIdForProgress,
                },
          );
          startDeferredReplyPoll(assistantId, priorAssistants, {
            onTimeout: () => {
              lastFailedSendTextRef.current = userText;
              setErrorMessage(EMPTY_REPLY_FAILURE_REASON);
            },
          });
        }
      }
      if (!telegramDeferred && assistantText.trim()) {
        setToolStatus(null);
      } else if (!telegramDeferred && !assistantText.trim() && !awaitingGatewayReplyRef.current) {
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
        machineLabel: machineShortLabel,
      });
      if (isSessionRemovedError(err) || message.includes('That chat was removed')) {
        invalidateRemovedSession(targetSessionId);
        skipSessionAutoSelectRef.current = true;
        suppressPostSendRefresh = true;
        setCurrentSession(null);
        setMessages([]);
        transcriptDigestRef.current = '';
      }
      if (kind === 'connectivity') {
        refreshHealth();
        void probeTailscaleComputers();
        void retryGatewayBootstrap();
        markOutboundBubbleStatus('failed');
        sendFailureDetail = chatSendBlockedMessage({
          connectionMode: settings.connectionMode,
          connectionState,
          gatewayUrl,
          healthProbePending,
        });
      } else if (kind === 'auth') {
        refreshHealth();
        markOutboundBubbleStatus('failed', message);
        setErrorMessage(message);
        sendFailureDetail = message;
      } else {
        markOutboundBubbleStatus('failed', message);
        setErrorMessage(message);
        sendFailureDetail = message;
      }
      lastFailedSendTextRef.current = userText;
      haptics.warning();
      return outboundUserBubbleCommitted;
    } finally {
      activeChatStreamRef.current = false;
      setIsChatStreamActive(false);
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
            detail: 'Reply ready on your computer',
            duration: Math.max(0, (Date.now() - completedStartedAt) / 1000),
          }));
          setTimeout(() => {
            setRunProgress((prev) =>
              prev?.phase === 'completed' && prev.startedAtMs === completedStartedAt ? null : prev,
            );
          }, RUN_COMPLETED_BANNER_DISMISS_MS);
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

      if (!isDemo && !suppressPostSendRefresh && currentSessionRef.current) {
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
    if (inTranscript && pinnedOutboundStatus === 'sent' && !isSending && !isActiveChatRun(runProgress)) {
      const timer = setTimeout(() => {
        setPinnedOutboundText(null);
        setPinnedOutboundSentAt(null);
        setPinnedOutboundStatus('pending');
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [messages, pinnedOutboundText, pinnedOutboundStatus, isSending, runProgress]);

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

    if (isSending || isChatStreamActive) {
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
        phase: isSending ? 'sending' : 'working',
        startedAtMs: sendStartedAtRef.current,
        detail:
          queuedOutboundCount > 0
            ? `${queuedOutboundCount} more message(s) queued after this`
            : isSending
              ? 'Delivering your message…'
              : 'Hermes is working on your computer…',
        sessionId: activeId,
      };
      if (currentSession) {
        return mergeSessionUsageIntoRunProgress(fallback, currentSession, fallback.detail);
      }
      return fallback;
    }

    return null;
  }, [runProgress, currentSession?.id, currentSession?.model, currentSession?.input_tokens, currentSession?.output_tokens, telegramReplySessionId, isSending, isChatStreamActive, queuedOutboundCount]);

  useEffect(() => {
    const observed =
      displayableLlmModel(currentSession?.model) ?? displayableLlmModel(progressBanner?.model);
    if (observed && observed !== lastKnownModel) {
      setLastKnownModel(observed);
    }
  }, [currentSession?.model, progressBanner?.model, lastKnownModel]);

  const headerGatewayModel = useMemo(
    () => gatewayModel ?? lastKnownModel,
    [gatewayModel, lastKnownModel],
  );

  const progressBannerFallbackModel = useMemo(
    () =>
      displayableLlmModel(currentSession?.model) ??
      displayableLlmModel(gatewayModel) ??
      displayableLlmModel(lastKnownModel) ??
      undefined,
    [currentSession?.model, gatewayModel, lastKnownModel],
  );

  const showComposerProgressBanner = useMemo(() => {
    if (!shouldShowComposerProgressBanner(progressBanner, isSending)) {
      return false;
    }
    const failedConnectivity =
      progressBanner?.phase === 'failed' &&
      isConnectivityMessage(progressBanner.detail ?? '');
    return shouldShowConnectivityRunBanner({
      isDemo,
      connectivityFailure: Boolean(failedConnectivity),
      heal: connectionHeal,
      hasAlternateRoutes: alternateHealRoutes,
    });
  }, [
    progressBanner,
    isSending,
    isDemo,
    connectionHeal,
    alternateHealRoutes,
  ]);

  const isRunActive = useMemo(() => {
    if (isSending) {
      return true;
    }
    if (!progressBanner) {
      return false;
    }
    return progressBanner.phase !== 'completed' && progressBanner.phase !== 'failed';
  }, [isSending, progressBanner]);

  const clearFailedOutboundState = useCallback(() => {
    setRunProgress(null);
    setPinnedOutboundText(null);
    setPinnedOutboundSentAt(null);
    setPinnedOutboundStatus('pending');
    setErrorMessage((prev) => (prev && isConnectivityMessage(prev) ? null : prev));
  }, []);

  const handleRetryConnectivity = useCallback(async () => {
    await handleMacRetry();
  }, [handleMacRetry]);

  const collectRecoveryRunIds = useCallback((): string[] => {
    const ids = [
      runProgress?.runId,
      runProgressRef.current?.runId,
      sendProgressSnapshotRef.current?.runId,
      progressBanner?.runId,
    ];
    return [...new Set(ids.filter((id): id is string => Boolean(id?.trim())))];
  }, [progressBanner?.runId, runProgress?.runId]);

  const handleStopRun = useCallback(async () => {
    const runIds = collectRecoveryRunIds();
    const runId = runIds[0];
    isSendingRef.current = false;
    setIsSending(false);
    activeChatStreamRef.current = false;
    setIsChatStreamActive(false);
    if (isDemo) {
      failPendingOutboundBubbles('Stopped');
      setRunProgress((prev) =>
        prev ? { ...prev, phase: 'failed', detail: 'Stopped' } : null,
      );
      haptics.warning();
      return;
    }
    try {
      if (runId) {
        await stopRun(gatewayUrl, runId, apiKey);
      } else {
        await releaseMacOperatorSlot(gatewayUrl, apiKey, runIds);
      }
      failPendingOutboundBubbles('Stopped on your computer');
      setRunProgress((prev) =>
        prev ? { ...prev, phase: 'failed', detail: 'Stopped on your computer' } : null,
      );
      haptics.warning();
    } catch (error) {
      await releaseMacOperatorSlot(gatewayUrl, apiKey, runIds).catch(() => {});
      failPendingOutboundBubbles('Stopped');
      setRunProgress((prev) =>
        prev ? { ...prev, phase: 'failed', detail: 'Stopped on your computer' } : null,
      );
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not stop the run on your computer',
      );
      haptics.warning();
    }
  }, [
    apiKey,
    collectRecoveryRunIds,
    failPendingOutboundBubbles,
    gatewayUrl,
    isDemo,
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
    isSendingRef.current = false;
    setIsSending(false);
    setRunProgress(null);
    setErrorMessage(null);
    setPinnedOutboundText(null);
    setPinnedOutboundSentAt(null);
    setPinnedOutboundStatus('pending');
    const retryText = lastFailedSendTextRef.current?.trim();
    if (retryText) {
      await sendUserTextRef.current(retryText, true);
    }
  }, [apiKey, gatewayUrl, progressBanner?.runId, runProgress?.runId]);

  const handleSelectAgentThread = useCallback(
    async (session: HermesSession) => {
      haptics.light();
      setRecentChatsDismissed(false);
      setSessionModalVisible(false);
      skipSessionAutoSelectRef.current = false;
      manualSessionSelectRef.current = session.id;
      currentSessionRef.current = session;
      transcriptDigestRef.current = '';
      messagesRef.current = [];
      setMessages([]);
      setCurrentSession(session);
      // Load transcript immediately — do not wait on project persist (Recents taps felt dead).
      void refreshSessionMessagesRef.current?.({ background: false, force: true });
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
            { skipUsageFields: Boolean(prev?.runId || prev?.streamUsageLive) },
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
    const timer = setInterval(pollSessionUsage, 500);
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

  useEffect(() => {
    const progress = runProgressRef.current;
    const session = currentSessionRef.current;
    if (isDemo || !progress || !isActiveChatRun(progress)) {
      return;
    }
    if (classifyRunStale(progress, Date.now(), session) !== 'expired') {
      const waitMs = msUntilRunStaleAutoFail(progress, Date.now(), session);
      const timer = setTimeout(() => {
        const current = runProgressRef.current;
        const activeSession = currentSessionRef.current;
        if (!current || !isActiveChatRun(current)) {
          return;
        }
        if (classifyRunStale(current, Date.now(), activeSession) !== 'expired') {
          return;
        }
        isSendingRef.current = false;
        setIsSending(false);
        setRunProgress((prev) =>
          prev && isActiveChatRun(prev)
            ? {
                ...prev,
                phase: 'failed',
                detail: RUN_STALE_TIMEOUT_DETAIL,
                duration: Math.max(0, (Date.now() - prev.startedAtMs) / 1000),
              }
            : prev,
        );
        haptics.warning();
      }, waitMs);
      return () => clearTimeout(timer);
    }
    isSendingRef.current = false;
    setIsSending(false);
    setRunProgress((prev) =>
      prev && isActiveChatRun(prev)
        ? {
            ...prev,
            phase: 'failed',
            detail: RUN_STALE_TIMEOUT_DETAIL,
            duration: Math.max(0, (Date.now() - prev.startedAtMs) / 1000),
          }
        : prev,
    );
  }, [
    isDemo,
    runProgress?.startedAtMs,
    runProgress?.phase,
    runProgress?.lastProgressAtMs,
    runProgress?.detail,
    currentSession?.input_tokens,
    currentSession?.output_tokens,
    currentSession?.cache_read_tokens,
    setRunProgress,
  ]);

  useEffect(() => {
    const progress = runProgressRef.current;
    const session = currentSessionRef.current;
    if (isDemo || !progress || !isActiveChatRun(progress)) {
      return;
    }
    if (shouldFailRunForStreamIdle(progress, Date.now(), session)) {
      isSendingRef.current = false;
      setIsSending(false);
      setRunProgress((prev) =>
        prev && isActiveChatRun(prev)
          ? {
              ...prev,
              phase: 'failed',
              detail: RUN_STREAM_IDLE_FAIL_DETAIL,
              duration: Math.max(0, (Date.now() - prev.startedAtMs) / 1000),
            }
          : prev,
      );
      haptics.warning();
      return;
    }
    const waitMs = msUntilStreamIdleFail(progress, Date.now(), session);
    const timer = setTimeout(() => {
      const current = runProgressRef.current;
      const activeSession = currentSessionRef.current;
      if (!current || !shouldFailRunForStreamIdle(current, Date.now(), activeSession)) {
        return;
      }
      isSendingRef.current = false;
      setIsSending(false);
      setRunProgress((prev) =>
        prev && isActiveChatRun(prev)
          ? {
              ...prev,
              phase: 'failed',
              detail: RUN_STREAM_IDLE_FAIL_DETAIL,
              duration: Math.max(0, (Date.now() - prev.startedAtMs) / 1000),
            }
          : prev,
      );
      haptics.warning();
    }, waitMs);
    return () => clearTimeout(timer);
  }, [
    isDemo,
    runProgress?.startedAtMs,
    runProgress?.phase,
    runProgress?.lastProgressAtMs,
    runProgress?.detail,
    currentSession?.input_tokens,
    currentSession?.output_tokens,
    currentSession?.cache_read_tokens,
    setRunProgress,
  ]);

  useEffect(() => {
    const progress = runProgressRef.current;
    if (isDemo || !progress || !isActiveChatRun(progress)) {
      return;
    }
    if (shouldFailRunAwaitingFirstToken(progress)) {
      isSendingRef.current = false;
      setIsSending(false);
      clearDeferredTelegramPoll();
      setRunProgress((prev) =>
        prev && isActiveChatRun(prev)
          ? {
              ...prev,
              phase: 'failed',
              detail: RUN_NO_TOKEN_FAIL_DETAIL,
              duration: Math.max(0, (Date.now() - prev.startedAtMs) / 1000),
            }
          : prev,
      );
      haptics.warning();
      return;
    }
    const waitMs = msUntilNoTokenFail(progress);
    const timer = setTimeout(() => {
      const current = runProgressRef.current;
      if (!current || !shouldFailRunAwaitingFirstToken(current)) {
        return;
      }
      isSendingRef.current = false;
      setIsSending(false);
      clearDeferredTelegramPoll();
      setRunProgress((prev) =>
        prev && isActiveChatRun(prev)
          ? {
              ...prev,
              phase: 'failed',
              detail: RUN_NO_TOKEN_FAIL_DETAIL,
              duration: Math.max(0, (Date.now() - prev.startedAtMs) / 1000),
            }
          : prev,
      );
      haptics.warning();
    }, waitMs);
    return () => clearTimeout(timer);
  }, [
    clearDeferredTelegramPoll,
    isDemo,
    runProgress?.outputTokens,
    runProgress?.phase,
    runProgress?.startedAtMs,
    setRunProgress,
  ]);

  useEffect(() => {
    const progress = runProgress;
    if (isDemo || !macChatLive || !progress || !isActiveChatRun(progress)) {
      return;
    }

    let cancelled = false;
    const clearSessionBusyError = () => {
      setErrorMessage((prev) =>
        prev?.toLowerCase().includes('still on the previous chat') ? null : prev,
      );
    };

    const reconcileGatewayRun = async () => {
      try {
        const current = runProgressRef.current;
        if (!current || !isActiveChatRun(current)) {
          return;
        }
        const runId = current.runId?.trim();
        if (!runId) {
          const knownRunIds = [
            runProgressRef.current?.runId,
            sendProgressSnapshotRef.current?.runId,
          ].filter((id): id is string => Boolean(id?.trim()));
          const action = await reconcileStaleActiveRunProgress(
            gatewayUrl,
            apiKey,
            current,
            knownRunIds,
          );
          if (cancelled || action !== 'clear') {
            return;
          }
          isSendingRef.current = false;
          setIsSending(false);
          setRunProgress(null);
          clearSessionBusyError();
          return;
        }

        const status = await getRunStatus(gatewayUrl, runId, apiKey);
        if (cancelled) {
          return;
        }
        if (!status) {
          isSendingRef.current = false;
          setIsSending(false);
          setRunProgress(null);
          clearSessionBusyError();
          void refreshSessionMessagesRef.current?.({ background: true });
          return;
        }
        const gatewayStatus = status.status?.toLowerCase();
        if (!isTerminalGatewayRunStatus(gatewayStatus)) {
          return;
        }
        isSendingRef.current = false;
        setIsSending(false);
        const reconciledStartedAt = runProgressRef.current?.startedAtMs;
        setRunProgress((prev) => {
          if (!prev || !isActiveChatRun(prev)) {
            return prev;
          }
          if (gatewayStatus === 'completed') {
            return {
              ...prev,
              phase: 'completed',
              detail: 'Reply ready on your computer',
              duration: Math.max(0, (Date.now() - prev.startedAtMs) / 1000),
            };
          }
          return null;
        });
        if (gatewayStatus === 'completed') {
          // Mirror the send-success path: auto-dismiss the completed banner. Without
          // this the reconcile path leaves "Reply ready on your computer" pinned
          // until the user taps Dismiss, and keeps re-posting the run notification.
          setTimeout(() => {
            setRunProgress((prev) =>
              prev?.phase === 'completed' && prev.startedAtMs === reconciledStartedAt
                ? null
                : prev,
            );
          }, RUN_COMPLETED_BANNER_DISMISS_MS);
        }
        clearSessionBusyError();
        void refreshSessionMessagesRef.current?.({ background: true, force: true });
      } catch {
        // transient gateway errors — keep showing banner
      }
    };

    void reconcileGatewayRun();
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void reconcileGatewayRun();
      }
    });
    const timer = setInterval(reconcileGatewayRun, 30_000);
    return () => {
      cancelled = true;
      appStateSub.remove();
      clearInterval(timer);
    };
  }, [
    apiKey,
    gatewayUrl,
    isDemo,
    macChatLive,
    effectiveMacHttpOk,
    runProgress?.runId,
    runProgress?.phase,
    runProgress?.detail,
    setRunProgress,
  ]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <ChatScreenHeader
          threadTitle={threadHeaderTitle}
          threadCreatedLabel={threadCreatedLabel}
          machineLabel={machineShortLabel}
          machineEndpoint={machineEndpoint}
          routeStatusLabel={routeStatusLabel}
          showMachineDetailWhenConnected={machineHeaderDisplay.showDetailWhenConnected}
          connectionState={connectionState}
          macHttpReachable={effectiveMacHttpOk || chatStalled}
          authMismatch={health?.authMismatch === true}
          isDemo={isDemo}
          chatStalled={chatStalled}
          workspaceName={activeProject?.name}
          workspaceHandoff={activeProject?.handoffSummary}
          canSwitchWorkspace={!showMacConnectionHelp}
          activeAgents={activeAgents}
          currentSession={currentSession}
          gatewayModel={headerGatewayModel}
          runProgress={progressBanner}
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
          macHttpReachable={effectiveMacHttpOk || chatStalled}
          macRetryBusy={macRetryBusy}
          silentHealInFlight={hideMacTileForSilentHeal}
          healExhausted={connectionHealExhausted && !effectiveMacHttpOk}
          pendingApprovalCount={composerApprovals.length}
          runProgress={progressBanner}
          isSending={isSending}
          machineName={machineShortLabel}
          chatStalled={chatStalled}
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
              connectionHealAttempt={connectionHealAttempt}
              connectionHealInFlight={connectionHealInFlight}
              connectionHealExhausted={connectionHealExhausted}
              onSwitchComputer={() => {
                haptics.selection();
                setMacPickerVisible(true);
              }}
              onSelectProfile={async (profileId) => {
                haptics.light();
                await selectGatewayProfile(profileId);
                await refreshHealth();
                connectEvents();
              }}
              onSearchMac={handleSearchMacFromChat}
              onFixUsbLink={() => void handleMacRetry()}
              usbFixBusy={macRetryBusy}
              onOpenSettings={() => navigation.navigate('Settings' as never)}
              tailscaleDiscoveries={tailscaleDiscoveries}
              tailscaleDiscoveryProbing={tailscaleDiscoveryProbing}
              tailnetProbeHostCount={tailnetProbeHostCount}
              onAddTailscaleComputer={(discovery) => {
                void addDiscoveredTailscaleComputer(discovery);
              }}
              onAddProfile={addGatewayProfile}
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
                  routeLabel={isDemo ? 'Demo computer' : machineShortLabel}
                  isConnected={effectiveMacChatLive}
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
              <>
              <FlashList
                ref={flatListRef}
                data={chatTimelineMessages}
                testID="chat-message-list"
                keyExtractor={(item, index) =>
                  item.message.id ?? `${item.message.role}-${item.originalIndex}-${index}`
                }
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
                onScrollBeginDrag={handleChatScrollBeginDrag}
                onScrollEndDrag={handleChatScrollEndDrag}
                onMomentumScrollEnd={handleChatScrollEndDrag}
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
                  if (pinScrollAfterHydrationRef.current) {
                    pinScrollAfterHydrationRef.current = false;
                    userScrolledUpRef.current = false;
                    lastDistanceFromBottomRef.current = 0;
                    setChatNearBottom(true);
                    scrollChatToLatest(false);
                    return;
                  }
                  scrollChatToLatestIfPinned(true, isChatStreamingActive());
                }}
                renderItem={renderChatMessageItem}
              />
              <ChatScrollControls
                showJumpToBottom={!chatNearBottom && chatTimelineMessages.length > 0}
                showJumpToTop={!chatNearTop && chatTimelineMessages.length > 2}
                onJumpToBottom={handleJumpToBottom}
                onJumpToTop={handleJumpToTop}
              />
              </>
            )}
          </View>
        ))}

        {!showMacConnectionHelp ? (
        <View
          style={[
            styles.composerDock,
            Platform.OS === 'ios' && keyboardOpen && styles.composerDockKeyboardOpen,
            composerDockContainerStyle(Platform.OS, composerDockSpacing),
          ]}
          testID="chat-composer-dock"
        >
        {operationalError ? (
          <ComposerErrorBanner
            message={operationalError}
            onDismiss={() => setErrorMessage(null)}
            actionLabel={showSessionBusyStop ? 'Stop run on computer & retry' : undefined}
            onAction={showSessionBusyStop ? () => void handleStopMacAndRetrySend() : undefined}
          />
        ) : null}

        {showSubmittedPromptStrip && pinnedOutboundText ? (
          <SubmittedPromptStrip
            text={pinnedOutboundText}
            sentAt={pinnedOutboundSentAt ?? undefined}
            status={pinnedOutboundStatus}
            connectionState={connectionState}
            macHttpOk={effectiveMacHttpOk}
          />
        ) : null}

        {showComposerProgressBanner && progressBanner ? (
          <RunProgressBanner
            progress={progressBanner}
            fallbackModel={progressBannerFallbackModel}
            showTechnicalStats={settings.includeToolActivity}
            megaSessionWarning={megaSessionWarning}
            onStartFreshChat={megaSessionWarning ? () => void handleStartFreshChat() : undefined}
            onStop={isRunActive || isSending ? () => void handleStopRun() : undefined}
            onDismiss={clearFailedOutboundState}
            onRetry={connectivityRunFailure ? () => void handleRetryConnectivity() : undefined}
            terminalToolName={operatorTerminalLine?.toolName}
            terminalPreview={operatorTerminalLine?.text}
          />
        ) : megaSessionWarning ? (
          <View style={styles.megaSessionBanner} testID="mega-session-banner">
            <Text style={styles.megaSessionBannerText}>{megaSessionWarning}</Text>
            <Pressable
              onPress={() => void handleStartFreshChat()}
              style={({ pressed }) => [styles.megaSessionBannerAction, pressed && styles.megaSessionBannerActionPressed]}
              testID="mega-session-start-fresh-chat"
            >
              <Text style={styles.megaSessionBannerActionText}>Start fresh chat</Text>
            </Pressable>
          </View>
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
            <Text style={styles.macRetryBannerText} testID="mac-connection-retry-banner-text">
              {macRetryBannerText}
            </Text>
          </Pressable>
        ) : null}

        <VaultProjectPickerChip
          projectName={activeProject?.name}
          handoffSummary={activeProject?.handoffSummary}
          onPress={!showMacConnectionHelp ? openProjectPicker : undefined}
        />

        <ChatInputBar
          value={inputValue}
          onChangeText={handleComposerTextChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onSubmit={handleSubmit}
          placeholder={inputPlaceholder}
          sendMuted={!composerHasSendableContent(inputValue, composerAttachments)}
          onSend={handleSend}
          showStop={isRunActive}
          onStop={() => void handleStopRun()}
          focusNonce={composerFocusNonce}
          attachments={composerAttachments}
          onRemoveAttachment={handleRemoveAttachment}
          onAttachPress={handleAttachPress}
        />
        </View>
        ) : null}
      </View>

      <BottomSheetModal
        visible={macPickerVisible}
        onClose={() => setMacPickerVisible(false)}
        testID="mac-picker-modal"
      >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose your computer</Text>
              <TouchableOpacity onPress={() => setMacPickerVisible(false)}>
                <Text style={styles.modalCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.macPickerScroll}
              contentContainerStyle={styles.macPickerContent}
              keyboardShouldPersistTaps="handled"
              testID="mac-picker-scroll"
            >
              <Text style={styles.modalSubtitle}>
                Pick a saved computer, or tap Find computers to search your home Wi‑Fi and known
                Tailscale addresses.
              </Text>
              <View style={styles.macSetupCard} testID="mac-picker-setup-help">
                <Text style={styles.macSetupTitle}>Missing your other machine?</Text>
                <Text style={styles.macSetupText}>
                  Start Hermes on your other machine, keep Tailscale on for both devices, then tap
                  Find computers. If it still does not appear, add its Tailscale MagicDNS name or
                  100.x address in Settings.
                </Text>
              </View>
              {tailscaleDiscoveries.length > 0 || tailscaleDiscoveryProbing ? (
                <TailscaleDiscoveryBanner
                  discoveries={tailscaleDiscoveries}
                  adding={tailscaleDiscoveryProbing}
                  probing={tailscaleDiscoveryProbing && tailscaleDiscoveries.length === 0}
                  onAdd={(discovery) => {
                    void addDiscoveredTailscaleComputer(discovery);
                  }}
                  prominent
                />
              ) : null}
              <GatewayProfilePicker
                profiles={switchComputerProfiles}
                activeProfileId={activeGatewayProfile?.id ?? null}
                activeReachable={macHttpOk}
                authNeedsRepair={health?.authMismatch === true}
                activeConnecting={connectionState === 'connecting'}
                scanning={profileScanning || isScanningMacs}
                scanProgress={profileScanProgress}
                scanResult={profileScanResult}
                wifiConnected={wifiConnected}
                showReachabilityHints={switchComputerProfiles.length > 1}
                onSelect={async (profileId) => {
                  haptics.light();
                  await selectGatewayProfile(profileId);
                  await refreshHealth();
                  connectEvents();
                  setMacPickerVisible(false);
                  pinScrollAfterHydrationRef.current = true;
                  userScrolledUpRef.current = false;
                  lastDistanceFromBottomRef.current = 0;
                  setCurrentSession(null);
                  setMessages([]);
                  const pickedProfile = gatewayProfiles.find((profile) => profile.id === profileId);
                  await loadSessionsList(true, {
                    computerSessionKeys: resolveComputerSessionStorageKeys(
                      pickedProfile,
                      pickedProfile?.gatewayUrl,
                    ),
                  });
                }}
                onRemove={
                  switchComputerProfiles.length > 1
                    ? async (profileId) => {
                        await removeGatewayProfile(profileId);
                      }
                    : undefined
                }
              />
              <LoadingButton
                label="Find computers"
                loadingLabel="Finding computers…"
                loading={isScanningMacs || profileScanning}
                variant="secondary"
                onPress={async () => {
                  setIsScanningMacs(true);
                  try {
                    await scanForGatewayProfiles();
                    void probeTailscaleComputers();
                  } finally {
                    setIsScanningMacs(false);
                  }
                }}
                testID="chat-find-macs-on-wifi"
                style={styles.newChatBtn}
              />
            </ScrollView>
      </BottomSheetModal>

      <BottomSheetModal
        visible={toolsModalVisible}
        onClose={() => setToolsModalVisible(false)}
        contentStyle={styles.toolsModalContent}
        testID="tools-modal"
      >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} testID="tools-modal-title">Tools</Text>
              <TouchableOpacity onPress={() => setToolsModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Toolsets, skills, and scheduled jobs on your computer gateway.
            </Text>
            <ScrollView style={styles.toolsModalScroll} keyboardShouldPersistTaps="handled">
              <GatewayOpsSection />
            </ScrollView>
      </BottomSheetModal>

      <BottomSheetModal
        visible={sessionModalVisible}
        onClose={() => setSessionModalVisible(false)}
        testID="threads-modal"
      >
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
                  const createdLabel = formatSessionCreated(sessionCreatedValue(item));
                  const sourceLabel = sessionSourceLabel(item);
                  return (
                    <View style={styles.sessionItemRowContainer}>
                      <TouchableOpacity
                        style={[styles.sessionItem, isActive && styles.sessionItemActive, { flex: 1 }]}
                        onPress={() => {
                          void handleSelectAgentThread(item);
                        }}
                      >
                        <View style={styles.sessionItemTitleRow}>
                          <ExpandableThreadTitle
                            title={sessionLabelFor(item)}
                            collapsedLines={2}
                            style={[styles.sessionItemTitle, isActive && styles.sessionItemTitleActive]}
                            testID={`threads-modal-title-${item.id}`}
                          />
                          {sourceLabel ? (
                            <Text style={styles.sessionSourcePill}>{sourceLabel}</Text>
                          ) : null}
                        </View>
                        {isTelegramInboxSession(item) ? (
                          <Text style={styles.sessionItemSubtitle}>
                            Merged view — pick a single thread for 1:1 parity with your computer
                          </Text>
                        ) : null}
                        {createdLabel ? (
                          <Text style={styles.sessionItemTime}>{createdLabel}</Text>
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
      </BottomSheetModal>

      <BottomSheetModal
        visible={projectModalVisible}
        onClose={() => setProjectModalVisible(false)}
        testID="project-modal"
      >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose project</Text>
              <TouchableOpacity onPress={() => setProjectModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Tag prompts with an AI-Agent-Sync project lane. Hermes runs tools in that repo on your computer.
            </Text>
            {vaultCatalogLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginBottom: 12 }} />
            ) : null}
            {vaultCatalog?.handoffs?.[0]?.summary ? (
              <Text style={styles.modalSubtitle} numberOfLines={3} testID="project-modal-latest-handoff">
                Latest handoff: {vaultCatalog.handoffs[0].summary}
              </Text>
            ) : null}
            <TextInput
              style={[styles.modalInput, { marginBottom: 12 }]}
              value={projectSearchQuery}
              onChangeText={setProjectSearchQuery}
              placeholder="Search projects..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              testID="project-search-input"
            />
            <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
              {filterChatProjects(projectState.projects, projectSearchQuery).map((project) => {
                const isActive = activeProject?.id === project.id;
                return (
                  <TouchableOpacity
                    key={project.id}
                    style={[styles.projectPickRow, isActive && styles.projectPickRowActive]}
                    onPress={() => handleSelectVaultProject(project)}
                    testID={`project-pick-${project.vaultSlug ?? project.id}`}
                  >
                    <Text style={styles.projectPickName}>{project.name}</Text>
                    {project.role ? (
                      <Text style={styles.projectPickMeta} numberOfLines={1}>{project.role}</Text>
                    ) : null}
                    <Text style={styles.projectPickPath} numberOfLines={2}>{project.workspacePath}</Text>
                    {project.handoffSummary ? (
                      <Text style={styles.projectPickHandoff} numberOfLines={2}>{project.handoffSummary}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {activeProject ? (
              <TouchableOpacity style={styles.clearProjectBtn} onPress={() => void handleClearProject()} testID="clear-project-button">
                <Text style={styles.clearProjectBtnText}>Clear project tag</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Custom workspace</Text>
            <TextInput
              style={styles.modalInput}
              value={newProjectPath}
              onChangeText={setNewProjectPath}
              placeholder="~/projects/my-app"
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
              <Text style={styles.newChatBtnText}>Add custom workspace</Text>
            </TouchableOpacity>
      </BottomSheetModal>

      <BottomSheetModal
        visible={renameModalVisible}
        onClose={() => setRenameModalVisible(false)}
        animationType="fade"
        contentStyle={{ minHeight: 180, justifyContent: 'center' }}
        testID="rename-modal"
      >
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
      </BottomSheetModal>

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
    alignItems: 'flex-start',
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
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
    lineHeight: 18,
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
  megaSessionBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    gap: 8,
  },
  megaSessionBannerText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: colors.error,
  },
  megaSessionBannerAction: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.45)',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  megaSessionBannerActionPressed: {
    opacity: 0.85,
  },
  megaSessionBannerActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
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
  toolsModalContent: {
    maxHeight: '88%',
  },
  toolsModalScroll: {
    flexGrow: 0,
  },
  macPickerScroll: {
    flexGrow: 0,
  },
  macPickerContent: {
    paddingBottom: 4,
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
  macSetupCard: {
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
    borderColor: 'rgba(34, 211, 238, 0.28)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  macSetupTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
    marginBottom: 6,
  },
  macSetupText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  projectPickRow: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  projectPickRowActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  projectPickName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  projectPickMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  projectPickPath: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  projectPickHandoff: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  clearProjectBtn: {
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  clearProjectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
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
