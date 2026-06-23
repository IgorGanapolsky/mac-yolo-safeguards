import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  RefreshControl,
  SectionList,
  AppState,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useGateway } from '../context/GatewayContext';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { colors } from '../theme/colors';
import { isDemoModeAllowed } from '../utils/demoModePolicy';
import { haptics } from '../services/haptics';
import GlassCard from '../components/GlassCard';
import GatewayProfilePicker from '../components/GatewayProfilePicker';
import {
  listSessions,
  createSession,
  listMessages,
  sendChatMessage,
} from '../services/hermesChatClient';
import { humanizeChatError, isConnectivityMessage } from '../utils/chatErrors';
import { HermesGatewayApiError, streamSessionChat } from '../services/hermesGatewayClient';
import type { HermesSession, HermesMessage } from '../types/chat';
import type { ChatProject, ChatProjectState } from '../types/chatProject';
import {
  bindSessionToProject,
  chatProjects,
  setActiveProject,
  setActiveSession,
} from '../services/chatProjects';
import { buildWorkspaceSystemPrompt } from '../utils/workspacePrompt';
import {
  formatSessionDate,
  sessionDisplayTitle,
  sessionLastActiveValue,
} from '../utils/sessionDisplay';
import { formatMessageTimestamp, prepareMessagesForDisplay } from '../utils/chatMessageDisplay';
import { isMessageBodyEmpty, isMessageDisplayEmpty, mergeServerMessagesWithPending } from '../utils/chatMessageMerge';
import { isInvertedChatNearLatest } from '../utils/chatScrollSync';
import ChatContextStrip from '../components/ChatContextStrip';
import ChatConnectionPanel from '../components/ChatConnectionPanel';
import LoadingButton from '../components/ui/LoadingButton';
import ChatMessageBubble from '../components/ChatMessageBubble';
import ChatApprovalBar from '../components/ChatApprovalBar';
import RunProgressBanner from '../components/RunProgressBanner';
import type { RunProgressState } from '../types/chatDisplay';
import { applyStreamEvent } from '../utils/chatStreamEvents';
import { resolveChatMachineLabel, resolveChatProject } from '../utils/chatContext';
import { isGatewayHealthOk } from '../utils/gatewayConnection';
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
} from '../services/telegramInbox';
import { isTelegramSession, pickPrimaryTelegramSession, buildSessionPickerSections, sessionSourceLabel } from '../utils/sessionSelection';
import { threadLabelAtMessageIndex } from '../utils/mergedThreadLabels';

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
  const navigation = useNavigation();
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
    pendingApprovals,
    submitApprovalChoice,
    sendGateAction,
    pendingApprovalEditSeed,
    clearApprovalEditSeed,
    pendingChatRelayText,
    clearChatRelayText,
    transcriptSyncNonce,
    runProgress,
    setRunProgress,
    connectEvents,
  } = useGateway();
  const gatewayUrl = effectiveGatewayUrl || settings.gatewayUrl;
  const keyboardInset = useKeyboardInset();
  const insets = useSafeAreaInsets();
  
  const [sessions, setSessions] = useState<HermesSession[]>([]);
  const [currentSession, setCurrentSession] = useState<HermesSession | null>(null);
  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sessionModalVisible, setSessionModalVisible] = useState(false);
  const [macPickerVisible, setMacPickerVisible] = useState(false);
  const [isScanningMacs, setIsScanningMacs] = useState(false);
  const [projectModalVisible, setProjectModalVisible] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [projectState, setProjectState] = useState<ChatProjectState>({
    projects: [],
    sessionProjectMap: {},
    activeProjectId: null,
  });
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingRunApproval, setPendingRunApproval] = useState<ChatRunApproval | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const [resolvedApprovalKeys, setResolvedApprovalKeys] = useState<Set<string>>(() => new Set());
  const [telegramReplySessionId, setTelegramReplySessionId] = useState<string>('');
  const [isRefreshingMessages, setIsRefreshingMessages] = useState(false);
  const [telegramInboxMeta, setTelegramInboxMeta] = useState({ threadCount: 0, messageCap: 250 });
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncAgeTick, setSyncAgeTick] = useState(0);

  const applyChatApiError = useCallback(
    (error: unknown, fallback: string, options?: { background?: boolean }) => {
      const { kind, message } = humanizeChatError(error, fallback);
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

  const flatListRef = useRef<FlatList<HermesMessage>>(null);
  const isSendingRef = useRef(false);
  const userNearBottomRef = useRef(true);
  const messagesRef = useRef<HermesMessage[]>([]);
  const sessionsLoadGenRef = useRef(0);
  const sendStartedAtRef = useRef(Date.now());
  const outboundQueueRef = useRef<string[]>([]);

  const [queuedOutboundCount, setQueuedOutboundCount] = useState(0);

  messagesRef.current = messages;

  const scrollChatToLatest = useCallback((animated = false) => {
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
    const { contentOffset } = event.nativeEvent;
    userNearBottomRef.current = isInvertedChatNearLatest(contentOffset.y);
  }, []);

  const isDemo = useMemo(() => {
    if (!isDemoModeAllowed()) {
      return false;
    }
    return settings.demoMode || connectionState === 'demo';
  }, [settings.demoMode, connectionState]);

  const macHttpOk = useMemo(() => isGatewayHealthOk(health), [health]);
  /** Chat uses HTTP to the Mac — works when health is ok even if the live WebSocket is still connecting. */
  const macChatLive = isDemo || connectionState === 'connected' || macHttpOk;
  const showMacConnectionHelp = !isDemo && !macChatLive;
  const operationalError =
    errorMessage && !isConnectivityMessage(errorMessage) ? errorMessage : null;

  const handleSearchMacFromChat = useCallback(async () => {
    haptics.selection();
    setIsScanningMacs(true);
    try {
      await scanForGatewayProfiles();
      await retryGatewayBootstrap();
      await autoConnectGateway();
      await refreshHealth();
    } finally {
      setIsScanningMacs(false);
    }
  }, [
    autoConnectGateway,
    refreshHealth,
    retryGatewayBootstrap,
    scanForGatewayProfiles,
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

  const machineLabel = useMemo(
    () => resolveChatMachineLabel(gatewayUrl, health, activeGatewayProfile, gatewayProfiles),
    [gatewayUrl, health, activeGatewayProfile, gatewayProfiles],
  );

  /** Lift composer above software keyboard (tab bar already hides when keyboardInset > 0). */
  const keyboardLift = keyboardInset > 0 ? keyboardInset : 0;
  const composerBottomPadding = keyboardInset > 0 ? 8 : Math.max(insets.bottom, 8);

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

  const workspacePrompt = useMemo(() => {
    const path = contextProject?.workspacePath;
    if (!path) return undefined;
    return buildWorkspaceSystemPrompt(path);
  }, [contextProject?.workspacePath]);

  const visibleSessions = useMemo(() => {
    if (!activeProject) return sessions;
    const filtered = projectSessions(sessions, projectState, activeProject.id);
    if (filtered.length > 0) {
      return filtered;
    }
    // Project has no bound chats yet — show full Mac session list (Telegram + mobile).
    return sessions;
  }, [sessions, projectState, activeProject]);

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

  const isTelegramView = useMemo(
    () =>
      currentSession &&
      (isTelegramInboxSession(currentSession) || isTelegramSession(currentSession)),
    [currentSession],
  );

  const inputPlaceholder = useMemo(() => {
    if (isSending) {
      return queuedOutboundCount > 0
        ? 'Another message queued — keep typing or tap Send'
        : 'Type your next message while Hermes works…';
    }
    if (isTelegramInboxSession(currentSession) && telegramReplySessionId) {
      const session = sessions.find((s) => s.id === telegramReplySessionId);
      const label = session ? sessionDisplayTitle(session) : telegramReplySessionId;
      return `Message → ${label}`;
    }
    if (isTelegramSession(currentSession)) {
      return 'Message on this Telegram thread';
    }
    return 'Type a message to Hermes';
  }, [currentSession, telegramReplySessionId, sessions, isSending, queuedOutboundCount]);

  const syncAgeLabel = useMemo(() => {
    if (!lastSyncedAt) {
      return '';
    }
    const seconds = Math.max(0, Math.floor((Date.now() - lastSyncedAt) / 1000));
    if (seconds < 8) {
      return 'just now';
    }
    if (seconds < 60) {
      return `${seconds}s ago`;
    }
    return `${Math.floor(seconds / 60)}m ago`;
  }, [lastSyncedAt, isRefreshingMessages, syncAgeTick]);

  useEffect(() => {
    if (!lastSyncedAt) {
      return;
    }
    const timer = setInterval(() => setSyncAgeTick((tick) => tick + 1), 10_000);
    return () => clearInterval(timer);
  }, [lastSyncedAt]);

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
          activeProjectId: 'demo-skool',
        };
        setProjectState(demoState);
        return;
      }
      setProjectState(loaded);
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
    if (!isDemo) {
      await chatProjects.save(next);
    }
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
      ];
      setSessions(mockSessions);
      if (selectLatest && mockSessions.length > 0) {
        setCurrentSession(mockSessions[0]);
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

      // 3. Default to latest Telegram thread (1:1 with Telegram app), not merged inbox
      if (!nextSession && (selectLatest || !currentSession) && finalSessions.length > 0) {
        const primaryTelegram = pickPrimaryTelegramSession(list);
        if (primaryTelegram) {
          nextSession =
            finalSessions.find((s) => s.id === primaryTelegram.id) ?? primaryTelegram;
        } else {
          nextSession = finalSessions[0];
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
    loadSessionsList(true);
  }, [isDemo, gatewayUrl, apiKey, macChatLive]);

  const refreshSessionMessages = useCallback(
    async (options?: { background?: boolean }) => {
      if (!currentSession) {
        setMessages([]);
        return;
      }

      if (!macChatLive) {
        setMessages([]);
        return;
      }

      if (isDemo) {
        if (currentSession.id === 'demo-1') {
          setMessages([
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
          ]);
        } else if (currentSession.id === 'demo-2') {
          setMessages([
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
          ]);
        } else {
          setMessages([]);
        }
        return;
      }

      try {
        if (options?.background) {
          setIsRefreshingMessages(true);
        } else {
          setIsLoadingMessages(true);
        }
        setErrorMessage(null);
        if (isTelegramInboxSession(currentSession)) {
          const { messages: tgMessages, replySessionId, threadCount, messageCap } =
            await fetchTelegramInboxMessages(gatewayUrl, sessions, apiKey, undefined, undefined, {
              includeToolActivity: settings.includeToolActivity,
              includeHermesStatus: true,
            });
          const merged =
            isSendingRef.current
              ? mergeServerMessagesWithPending(tgMessages, messagesRef.current)
              : tgMessages;
          setMessages(merged);
          setTelegramReplySessionId(replySessionId);
          setTelegramInboxMeta({ threadCount, messageCap });
        } else {
          const history = await listMessages(gatewayUrl, currentSession.id, apiKey);
          const isTelegram = isTelegramSession(currentSession);
          const displayMessages = isTelegram
            ? prepareMessagesForDisplay(history, {
                includeToolActivity: settings.includeToolActivity,
                includeHermesStatus: true,
              })
            : history;
          const merged = isSendingRef.current
            ? mergeServerMessagesWithPending(displayMessages, messagesRef.current)
            : displayMessages;
          setMessages(merged);
          setTelegramReplySessionId('');
          setTelegramInboxMeta({ threadCount: 0, messageCap: 0 });
        }
        setLastSyncedAt(Date.now());
      } catch (err) {
        applyChatApiError(err, 'Could not load messages from your computer.', options);
      } finally {
        setIsLoadingMessages(false);
        setIsRefreshingMessages(false);
      }
    },
    [currentSession, isDemo, gatewayUrl, apiKey, sessions, settings.includeToolActivity],
  );

  useEffect(() => {
    setUndoSecondsLeft(0);
    setRunProgress(null);
    refreshSessionMessages();
  }, [refreshSessionMessages, setRunProgress]);

  useFocusEffect(
    useCallback(() => {
      if (!currentSession || isDemo || isLoadingMessages || !macChatLive) {
        return;
      }
      if (connectionState !== 'connected' && connectionState !== 'demo') {
        connectEvents();
      }
      refreshSessionMessages({ background: true });
    }, [
      currentSession,
      isDemo,
      isLoadingMessages,
      macChatLive,
      connectionState,
      connectEvents,
      refreshSessionMessages,
    ]),
  );

  useEffect(() => {
    if (!currentSession || isDemo || !macChatLive) {
      return;
    }
    refreshSessionMessages({ background: true });
  }, [transcriptSyncNonce, currentSession, isDemo, macChatLive, refreshSessionMessages]);

  const telegramLiveSync = connectionState === 'connected';

  // Fallback and background polling loop
  useEffect(() => {
    if (!currentSession || isDemo || !macChatLive) {
      return;
    }
    // We poll if:
    // 1. It is a Telegram session (always poll, 12s if live WS, 8s if HTTP-only)
    // 2. The WebSocket is down (8s HTTP fallback polling for all sessions)
    const shouldPoll = isTelegramView || connectionState !== 'connected';
    if (!shouldPoll) {
      return;
    }
    const intervalMs =
      isTelegramView ? (connectionState === 'connected' ? 5000 : 4000) : connectionState === 'connected' ? 12000 : 8000;
    const timer = setInterval(() => {
      refreshSessionMessages({ background: true });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [currentSession, isDemo, macChatLive, isTelegramView, connectionState, refreshSessionMessages]);

  useEffect(() => {
    if (!currentSession || isDemo || !macChatLive) {
      return;
    }
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshSessionMessages({ background: true });
      }
    });
    return () => sub.remove();
  }, [currentSession, isDemo, macChatLive, refreshSessionMessages]);

  useEffect(() => {
    if (!currentSession || isDemo || !macChatLive) {
      return;
    }
    if (!isSending && !runProgress) {
      return;
    }
    const timer = setInterval(() => {
      refreshSessionMessages({ background: true });
    }, 4_000);
    return () => clearInterval(timer);
  }, [currentSession, isDemo, macChatLive, isSending, runProgress, refreshSessionMessages]);

  const telegramThreadSyncHint = useMemo(() => {
    const age = syncAgeLabel || '…';
    if (telegramLiveSync) {
      return `Telegram thread · synced ${age} · polls every 5s`;
    }
    return `Telegram thread · synced ${age} · HTTP poll every 4s`;
  }, [syncAgeLabel, telegramLiveSync]);

  const syncBarLabel = useMemo(() => {
    const age = syncAgeLabel || '…';
    if (isTelegramInboxSession(currentSession)) {
      return `${telegramInboxMeta.threadCount} thread(s) · synced ${age}`;
    }
    if (isTelegramSession(currentSession)) {
      return telegramThreadSyncHint;
    }
    return `Synced ${age}`;
  }, [
    currentSession,
    syncAgeLabel,
    telegramInboxMeta.threadCount,
    telegramThreadSyncHint,
  ]);

  const handleManualSync = useCallback(async () => {
    if (!currentSession || isDemo || !macChatLive || isRefreshingMessages) {
      return;
    }
    haptics.light();
    const stickToBottom = userNearBottomRef.current || isSending;
    await refreshSessionMessages({ background: true });
    if (stickToBottom) {
      requestAnimationFrame(() => scrollChatToLatest(true));
    }
  }, [
    currentSession,
    isDemo,
    macChatLive,
    isRefreshingMessages,
    isSending,
    refreshSessionMessages,
    scrollChatToLatest,
  ]);

  const switchToTelegramReplyThread = useCallback(() => {
    if (!telegramReplySessionId) {
      return;
    }
    const match = sessions.find((s) => s.id === telegramReplySessionId);
    if (!match) {
      return;
    }
    haptics.selection();
    setCurrentSession(match);
  }, [telegramReplySessionId, sessions]);

  const telegramReplyLabel = useMemo(() => {
    if (!telegramReplySessionId) {
      return '';
    }
    const session = sessions.find((s) => s.id === telegramReplySessionId);
    return session ? sessionDisplayTitle(session) : telegramReplySessionId;
  }, [telegramReplySessionId, sessions]);

  useEffect(() => {
    userNearBottomRef.current = true;
    if (isLoadingMessages) {
      return;
    }
    scrollChatToLatest(false);
    const retryTimer = setTimeout(() => scrollChatToLatest(false), 200);
    return () => clearTimeout(retryTimer);
  }, [currentSession?.id, isLoadingMessages, scrollChatToLatest]);

  useEffect(() => {
    if (!isSending || isLoadingMessages || messages.length === 0) {
      return;
    }
    scrollChatToLatest(true);
  }, [messages, isSending, isLoadingMessages, scrollChatToLatest]);

  const handleNewChat = async () => {
    haptics.selection();
    setSessionModalVisible(false);

    const sessionTitle = activeProject
      ? `${activeProject.name} — ${new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      : `Session #${sessions.length + 1}`;

    if (isDemo) {
      const newSess: HermesSession = {
        id: `demo-${Date.now()}`,
        title: sessionTitle,
        last_active_at: new Date().toISOString(),
      };
      setSessions((prev) => [newSess, ...prev]);
      setCurrentSession(newSess);
      setMessages([]);
      if (activeProject) {
        const next = bindSessionToProject(projectState, activeProject.id, newSess.id);
        await persistProjectState(next);
      }
      return;
    }

    try {
      setIsLoadingSessions(true);
      const newSess = await createSession(
        gatewayUrl,
        apiKey,
        sessionTitle,
        workspacePrompt,
      );
      setSessions((prev) => [newSess, ...prev]);
      setCurrentSession(newSess);
      setMessages([]);
      if (activeProject) {
        const next = bindSessionToProject(projectState, activeProject.id, newSess.id);
        await persistProjectState(next);
      }
    } catch (err) {
      applyChatApiError(err, 'Could not start a new chat on your computer.');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const userText = inputValue.trim();
    setInputValue('');
    await sendUserText(userText);
  };

  const drainOutboundQueue = () => {
    const next = outboundQueueRef.current.shift();
    setQueuedOutboundCount(outboundQueueRef.current.length);
    if (next) {
      queueMicrotask(() => sendUserText(next));
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
          sendChatText: (text) => sendUserText(text, true),
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
      sendChatText: (text) => sendUserText(text, true),
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

  const handleInlineTextApproval = (textApproval: ChatTextApproval, choice: ApprovalChoice) => {
    const request = enrichApprovalRequest(
      fromChatTextApproval(textApproval),
      settings.approvalPolicy,
    );
    handleApprovalChoice(choice, request, textApproval);
  };

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

  async function sendUserText(userText: string, isProgrammatic = false) {
    if (!userText.trim()) return;

    if (isSendingRef.current) {
      const trimmed = userText.trim();
      outboundQueueRef.current.push(trimmed);
      setQueuedOutboundCount(outboundQueueRef.current.length);
      if (!isProgrammatic) {
        setMessages((prev) => [
          ...prev,
          {
            id: `user-queued-${Date.now()}`,
            role: 'user',
            content: trimmed,
            created_at: new Date().toISOString(),
          },
        ]);
        haptics.light();
      }
      return;
    }

    isSendingRef.current = true;
    setIsSending(true);

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
            return;
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
            return;
          }
        }
      }
    }

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
        try {
          setIsSending(true);
          const title = activeProject?.name ?? 'New mobile session';
          activeSess = await createSession(
            gatewayUrl,
            apiKey,
            title,
            workspacePrompt,
          );
          setSessions([activeSess]);
          setCurrentSession(activeSess);
          if (activeProject) {
            const next = bindSessionToProject(projectState, activeProject.id, activeSess.id);
            await persistProjectState(next);
          }
        } catch (err) {
          applyChatApiError(err, 'Could not start chat on your computer.');
          isSendingRef.current = false;
          setIsSending(false);
          return;
        }
      }
    }

    const userMessage: HermesMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setToolStatus(null);

    sendStartedAtRef.current = Date.now();
    setIsSending(true);

    if (isDemo) {
      setTimeout(() => {
        const assistantText = `[Demo Mode] I received: "${userText}". Since the gateway is in demo mode, I'm providing a mock reply. Let me know if you want to test live controls!`;
        const assistantMessage: HermesMessage = {
          role: 'assistant',
          content: assistantText,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        isSendingRef.current = false;
        setIsSending(false);
        haptics.success();
        drainOutboundQueue();
      }, 1500);
      return;
    }

    const targetSessionId = isTelegramInboxSession(activeSess) ? telegramReplySessionId : activeSess.id;
    if (isTelegramInboxSession(activeSess) && !targetSessionId) {
      setErrorMessage('No active Telegram session found to reply to.');
      isSendingRef.current = false;
      setIsSending(false);
      return;
    }

    try {
      const assistantId = `asst-${Date.now()}`;
      let assistantBubbleAdded = false;

      const updateAssistant = (text: string) => {
        const body = text.trim();
        if (!body) {
          return;
        }
        if (!assistantBubbleAdded) {
          assistantBubbleAdded = true;
          setMessages((prev) => [
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
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: body } : m)),
        );
      };

      let assistantText = '';
      try {
        assistantText = await streamSessionChat(
          gatewayUrl,
          targetSessionId,
          userText,
          apiKey,
          (evt) => {
            const eventName = String(evt.event ?? '').toLowerCase();
            if (
              eventName === 'run.completed' ||
              eventName === 'done' ||
              eventName === 'run.failed' ||
              eventName === 'error'
            ) {
              setRunProgress(null);
            } else if (
              eventName === 'run.status' ||
              eventName === 'run.progress' ||
              eventName === 'status.update' ||
              eventName === 'provider.waiting' ||
              eventName === 'assistant.delta' ||
              eventName === 'approval.request' ||
              eventName.startsWith('tool.')
            ) {
              setRunProgress((prev) => {
                const dummyState = { runProgress: prev, toolCalls: [] };
                const nextState = applyStreamEvent(dummyState, evt);
                return nextState.runProgress;
              });
            }

            if (evt.event === 'assistant.delta' && typeof evt.data.delta === 'string') {
              assistantText += evt.data.delta;
              updateAssistant(assistantText);
            }
            if (typeof evt.event === 'string' && evt.event.startsWith('tool.') && evt.data.tool_name) {
              setToolStatus(`${evt.event}: ${String(evt.data.tool_name)}`);
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
          workspacePrompt,
        );
      } catch (streamErr) {
        const streamMessage =
          streamErr instanceof Error ? streamErr.message : String(streamErr);
        const streamStatus =
          streamErr instanceof HermesGatewayApiError ? streamErr.status : 0;
        const shouldFallback =
          streamStatus >= 400 ||
          streamMessage.includes('Network request failed') ||
          streamMessage.includes('Failed to fetch');

        if (shouldFallback) {
          const response = await sendChatMessage(
            gatewayUrl,
            targetSessionId,
            userText,
            apiKey,
            workspacePrompt,
          );
          assistantText = response.assistantText;
          updateAssistant(assistantText);
          setToolStatus('Sent without live stream (connection fallback)');
        } else {
          throw streamErr;
        }
      }

      if (!assistantText.trim()) {
        updateAssistant('(Hermes did not return text yet — pull to sync when the run finishes.)');
      }
      setToolStatus(null);
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
    } catch (err) {
      applyChatApiError(err, 'Message could not reach your computer. Check the connection steps above.');
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
      setRunProgress(null);
      if (!isDemo && currentSession) {
        refreshSessionMessages({ background: true });
      }
      drainOutboundQueue();
    }
  };

  useEffect(() => {
    if (!pendingChatRelayText || isSending) {
      return;
    }
    const relay = pendingChatRelayText;
    clearChatRelayText();
    sendUserText(relay, true);
  }, [pendingChatRelayText, clearChatRelayText, isSending]);

  const progressBanner = useMemo((): RunProgressState | null => {
    if (runProgress) {
      return runProgress;
    }
    if (isSending) {
      return {
        phase: 'sending',
        startedAtMs: sendStartedAtRef.current,
        detail: queuedOutboundCount > 0
          ? `${queuedOutboundCount} more message(s) queued after this`
          : 'Sending to your computer…',
      };
    }
    return null;
  }, [runProgress, isSending, queuedOutboundCount]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title} testID="HERMES CHAT">💬 HERMES CHAT</Text>
          {isDemo && <Text style={styles.demoPill}>DEMO MODE</Text>}
        </View>

        <ChatContextStrip
          machineLabel={machineLabel}
          connectionState={connectionState}
          macHttpReachable={macHttpOk}
          projectName={contextProject?.name}
          workspacePath={contextProject?.workspacePath}
          onPressMac={() => {
            haptics.selection();
            setMacPickerVisible(true);
          }}
          macSwitchHint={
            gatewayProfiles.length > 1
              ? 'Tap here to switch between profiles'
              : 'Tap here to find your computer or scan QR in Settings'
          }
          channelHint={
            !contextProject && isTelegramView
              ? 'Telegram thread — workspace follows your computer gateway'
              : undefined
          }
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.projectChipRow}
          testID="project-chip-row"
        >
          {projectState.projects.map((project) => {
            const isActive = projectState.activeProjectId === project.id;
            return (
              <TouchableOpacity
                key={project.id}
                style={[styles.projectChip, isActive && styles.projectChipActive]}
                onPress={() => selectProject(project)}
                testID={`project-chip-${project.name}`}
              >
                <Text style={[styles.projectChipText, isActive && styles.projectChipTextActive]}>
                  {project.name}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.projectChipAdd}
            onPress={() => {
              haptics.selection();
              setProjectModalVisible(true);
            }}
            testID="add-project-chip"
          >
            <Text style={styles.projectChipAddText}>+ Project</Text>
          </TouchableOpacity>
        </ScrollView>

        <TouchableOpacity
          style={styles.sessionSelector}
          onPress={openSessionsModal}
          testID="open-sessions-modal"
        >
          <Text style={styles.sessionSelectorText} numberOfLines={1}>
            {currentSession
              ? sessionDisplayTitle(currentSession)
              : activeProject
                ? `New ${activeProject.name} chat…`
                : 'Select or start a chat session...'}
          </Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={[
          styles.keyboardContainer,
          keyboardLift > 0 && { paddingBottom: keyboardLift },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios' && keyboardLift === 0}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        {showMacConnectionHelp ? (
          <ChatConnectionPanel
            connectionState={connectionState}
            macLabel={machineLabel.split(' (')[0]}
            searching={isScanningMacs || profileScanning}
            scanProgress={profileScanProgress}
            scanResult={profileScanResult}
            onSearchMac={handleSearchMacFromChat}
            onOpenSettings={() => navigation.navigate('Settings' as never)}
          />
        ) : null}

        {operationalError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{operationalError}</Text>
            <TouchableOpacity onPress={() => setErrorMessage(null)}>
              <Text style={styles.errorClose}>×</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {isLoadingMessages ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Fetching session history...</Text>
          </View>
        ) : (
          <View style={styles.chatListSection} testID="chat-list-section">
            {currentSession ? (
              <Pressable
                style={styles.syncHintRow}
                onPress={handleManualSync}
                disabled={!macChatLive || isRefreshingMessages}
                testID="chat-sync-button"
                accessibilityRole="button"
                accessibilityLabel="Sync chat with your Mac"
              >
                <View style={styles.syncHintInner}>
                  {isRefreshingMessages ? (
                    <ActivityIndicator size="small" color={colors.accent} style={styles.syncHintSpinner} />
                  ) : (
                    <Text style={styles.syncHintIcon}>↻</Text>
                  )}
                  <Text style={styles.syncHintText} testID="chat-sync-label">
                    {syncBarLabel}
                    {isTelegramInboxSession(currentSession) && telegramReplyLabel
                      ? ` · replies → ${telegramReplyLabel}`
                      : ''}
                    {' · pull or tap to sync'}
                    {isTelegramInboxSession(currentSession) && telegramReplySessionId
                      ? ' · › opens thread'
                      : ''}
                  </Text>
                  {isTelegramInboxSession(currentSession) && telegramReplySessionId ? (
                    <Pressable
                      onPress={switchToTelegramReplyThread}
                      hitSlop={8}
                      testID="telegram-open-thread"
                      accessibilityLabel={`Open thread ${telegramReplyLabel}`}
                    >
                      <Text style={styles.syncHintChevron}>›</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
            {messages.length === 0 ? (
              <ScrollView
                style={styles.chatListFlex}
                contentContainerStyle={styles.emptyContainer}
                testID="chat-empty-state"
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshingMessages}
                    onRefresh={() => void handleManualSync()}
                    tintColor={colors.accent}
                    colors={[colors.accent]}
                  />
                }
              >
                <GlassCard style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>
                    {showMacConnectionHelp ? 'Ready when your Mac is linked' : 'Chat directly with Hermes'}
                  </Text>
                  <Text style={styles.emptyBody}>
                    {showMacConnectionHelp
                      ? 'Finish the steps above, then start a chat or pick a session from the menu.'
                      : 'Ask questions, issue terminal commands, or request workspace analysis. Each project keeps its own chat history and workspace context on your Mac.'}
                  </Text>
                  {!currentSession && macChatLive && (
                    <TouchableOpacity style={styles.newChatBtnInline} onPress={handleNewChat}>
                      <Text style={styles.newChatBtnInlineText}>Start New Session</Text>
                    </TouchableOpacity>
                  )}
                </GlassCard>
              </ScrollView>
            ) : (
              <FlatList
                ref={flatListRef}
                data={[...messages].reverse()}
                keyExtractor={(item, index) => item.id ?? `${item.role}-${index}`}
                style={styles.flatList}
                contentContainerStyle={styles.messageList}
                nestedScrollEnabled={false}
                onScroll={handleChatScroll}
                scrollEventThrottle={16}
                inverted
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshingMessages}
                    onRefresh={() => void handleManualSync()}
                    tintColor={colors.accent}
                    colors={[colors.accent]}
                  />
                }
                onContentSizeChange={() => scrollChatToLatestIfPinned(isSending)}
                renderItem={({ item, index }) => {
                  const isUser = item.role === 'user';
                  const timeLabel = formatMessageTimestamp(item.created_at ?? item.timestamp);
                  const originalIndex = messages.length - 1 - index;
                  const inlineNudge = inlineTextApprovals.get(originalIndex);
                  if (isMessageDisplayEmpty(item.content) && !inlineNudge) {
                    return null;
                  }
                  const threadLabel = isTelegramInboxSession(currentSession)
                    ? threadLabelAtMessageIndex(messages, originalIndex)
                    : undefined;
                  return (
                    <ChatMessageBubble
                      content={item.content}
                      rawContent={item.rawContent}
                      truncated={item.truncated}
                      isUser={isUser}
                      timeLabel={timeLabel}
                      threadLabel={threadLabel}
                      threadDivider={threadLabel !== undefined && originalIndex > 0}
                      inlineApproval={
                        inlineNudge
                          ? {
                              title: inlineNudge.title,
                              busy: approvalBusy || isSending,
                              onApprove: () => handleInlineTextApproval(inlineNudge, 'once'),
                              onDeny: () => handleInlineTextApproval(inlineNudge, 'deny'),
                            }
                          : undefined
                      }
                    />
                  );
                }}
              />
            )}
          </View>
        )}

        {progressBanner && (
          <RunProgressBanner progress={progressBanner} />
        )}

        {toolStatus ? (
          <View style={styles.toolStatusRow}>
            <Text style={styles.toolStatusText}>{toolStatus}</Text>
          </View>
        ) : null}

        {composerApprovals.length > 0 || undoSecondsLeft > 0 ? (
          <>
            {composerApprovals.length > 0 &&
            connectionState !== 'connected' &&
            connectionState !== 'demo' ? (
              <View style={styles.linkWarningRow} testID="chat-approval-link-warning">
                <Text style={styles.linkWarningText}>
                  Mac not linked — tap the Mac row above to connect before approving.
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

        <View style={[styles.inputBar, { paddingBottom: composerBottomPadding }]}>
          <TextInput
            style={styles.input}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder={inputPlaceholder}
            placeholderTextColor={colors.textMuted}
            editable
            multiline
            returnKeyType="send"
            blurOnSubmit={true}
            onSubmitEditing={() => {
              if (inputValue.trim()) {
                handleSendMessage();
              }
            }}
            testID="chat-input"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputValue.trim() || isSending) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!inputValue.trim() || isSending}
            testID="chat-send-button"
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
              <Text style={styles.modalTitle}>Switch Mac</Text>
              <TouchableOpacity onPress={() => setMacPickerVisible(false)}>
                <Text style={styles.modalCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Pick a saved Mac or search Wi‑Fi for Hermes on your network. Another Mac not listed?
              Open Hermes on that computer (same Wi‑Fi), then tap Find Macs below. Away from home?
              Settings → Advanced → paste a tunnel URL (ngrok, Tailscale, Cloudflare).
            </Text>
            <GatewayProfilePicker
              profiles={gatewayProfiles}
              activeProfileId={activeGatewayProfile?.id ?? null}
              scanning={profileScanning || isScanningMacs}
              scanProgress={profileScanProgress}
              scanResult={profileScanResult}
              onSelect={async (profileId) => {
                haptics.light();
                await selectGatewayProfile(profileId);
                await autoConnectGateway();
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
              label="Find Macs on Wi‑Fi"
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
        visible={sessionModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSessionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Chat Session</Text>
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
                  ? `No chats bound to ${activeProject.name} yet — showing all Mac sessions (Telegram + mobile). Start one below or pick a thread.`
                  : `Sessions in this project use workspace: ${activeProject.workspacePath}`}
              </Text>
            ) : null}

            <TouchableOpacity style={styles.newChatBtn} onPress={handleNewChat} testID="modal-new-chat-button">
              <Text style={styles.newChatBtnText}>+ Start New Session</Text>
            </TouchableOpacity>

            {isLoadingSessions ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
            ) : (
              <SectionList
                sections={sessionPickerSections}
                keyExtractor={(item) => item.id}
                style={styles.sessionList}
                stickySectionHeadersEnabled={false}
                renderSectionHeader={({ section }) => (
                  <Text style={styles.sessionSectionHeader}>{section.title}</Text>
                )}
                renderItem={({ item }) => {
                  const isActive = currentSession?.id === item.id;
                  const lastActiveLabel = formatSessionDate(sessionLastActiveValue(item));
                  const sourceLabel = sessionSourceLabel(item);
                  return (
                    <TouchableOpacity
                      style={[styles.sessionItem, isActive && styles.sessionItemActive]}
                      onPress={async () => {
                        haptics.light();
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
                          {sessionDisplayTitle(item)}
                        </Text>
                        {sourceLabel ? (
                          <Text style={styles.sessionSourcePill}>{sourceLabel}</Text>
                        ) : null}
                      </View>
                      {isTelegramInboxSession(item) ? (
                        <Text style={styles.sessionItemSubtitle}>
                          Merged view — pick a single thread for 1:1 parity with Telegram
                        </Text>
                      ) : null}
                      {lastActiveLabel ? (
                        <Text style={styles.sessionItemTime}>{lastActiveLabel}</Text>
                      ) : null}
                    </TouchableOpacity>
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
              <Text style={styles.modalTitle}>Add Mac workspace</Text>
              <TouchableOpacity onPress={() => setProjectModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Each project gets its own chat history and pins Hermes tools to that folder on your Mac.
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
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 2,
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
  },
  chatListSection: {
    flex: 1,
    minHeight: 0,
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
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1,
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
  emptyContainer: {
    paddingTop: 40,
    paddingHorizontal: 8,
  },
  emptyCard: {
    padding: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
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
  syncHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 4,
    backgroundColor: colors.backgroundStart,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    zIndex: 2,
    elevation: 2,
  },
  syncHintPressable: {
    flex: 1,
  },
  syncHintInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncHintIcon: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '800',
    width: 18,
    textAlign: 'center',
  },
  syncHintSpinner: {
    width: 18,
  },
  syncHintChevron: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '700',
  },
  syncHintChevronBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  syncHintText: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
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
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: 'rgba(9, 11, 20, 0.96)',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 14,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
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
  errorText: {
    color: colors.error,
    fontSize: 12,
    flex: 1,
    marginRight: 8,
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
  sessionList: {
    marginBottom: 20,
  },
  sessionItem: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sessionItemActive: {
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
    borderRadius: 8,
    borderBottomColor: 'transparent',
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
    letterSpacing: 0.3,
    color: colors.accent,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sessionSectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
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
});
