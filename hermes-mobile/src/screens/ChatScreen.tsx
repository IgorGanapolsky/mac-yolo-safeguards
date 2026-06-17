import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGateway } from '../context/GatewayContext';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import GlassCard from '../components/GlassCard';
import {
  listSessions,
  createSession,
  listMessages,
  sendChatMessage,
} from '../services/hermesChatClient';
import { streamSessionChat } from '../services/hermesGatewayClient';
import type { HermesSession, HermesMessage } from '../types/chat';
import type { ChatProject, ChatProjectState } from '../types/chatProject';
import {
  bindSessionToProject,
  chatProjects,
  setActiveProject,
  setActiveSession,
} from '../services/chatProjects';
import { buildWorkspaceSystemPrompt } from '../utils/workspacePrompt';

function sessionLastActive(session: HermesSession): string | undefined {
  return session.last_active_at ?? session.last_active;
}

function projectSessions(
  allSessions: HermesSession[],
  projectState: ChatProjectState,
  projectId: string,
): HermesSession[] {
  const ids = new Set(
    projectState.projects.find((p) => p.id === projectId)?.sessionIds ?? [],
  );
  return allSessions.filter((session) => ids.has(session.id));
}

export default function ChatScreen() {
  const { settings, connectionState, apiKey } = useGateway();
  const [sessions, setSessions] = useState<HermesSession[]>([]);
  const [currentSession, setCurrentSession] = useState<HermesSession | null>(null);
  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sessionModalVisible, setSessionModalVisible] = useState(false);
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

  const flatListRef = useRef<FlatList<HermesMessage>>(null);

  const isDemo = useMemo(() => {
    return settings.demoMode || connectionState === 'demo';
  }, [settings.demoMode, connectionState]);

  const activeProject = useMemo(() => {
    if (!projectState.activeProjectId) return null;
    return projectState.projects.find((p) => p.id === projectState.activeProjectId) ?? null;
  }, [projectState]);

  const workspacePrompt = useMemo(() => {
    if (!activeProject?.workspacePath) return undefined;
    return buildWorkspaceSystemPrompt(activeProject.workspacePath);
  }, [activeProject?.workspacePath]);

  const visibleSessions = useMemo(() => {
    if (!activeProject) return sessions;
    return projectSessions(sessions, projectState, activeProject.id);
  }, [sessions, projectState, activeProject]);

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

  // Load all sessions on mount / connection change
  const loadSessionsList = async (selectLatest = false) => {
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

    try {
      setIsLoadingSessions(true);
      setErrorMessage(null);
      const list = await listSessions(settings.gatewayUrl, apiKey);
      setSessions(list);
      if (selectLatest && projectState.activeProjectId) {
        const project = projectState.projects.find((p) => p.id === projectState.activeProjectId);
        const preferredId = project?.activeSessionId ?? project?.sessionIds[0];
        const preferred = preferredId ? list.find((s) => s.id === preferredId) : undefined;
        if (preferred) {
          setCurrentSession(preferred);
          return;
        }
      }
      if (selectLatest && list.length > 0) {
        setCurrentSession(list[0]);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load chat sessions');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadSessionsList(true);
  }, [isDemo, settings.gatewayUrl, apiKey]);

  // Load messages whenever selected session changes
  useEffect(() => {
    if (!currentSession) {
      setMessages([]);
      return;
    }

    const loadSessionHistory = async () => {
      if (isDemo) {
        if (currentSession.id === 'demo-1') {
          setMessages([
            { role: 'user', content: 'What is the yolo-health check score?' },
            { role: 'assistant', content: 'Your yolo-health check score is currently 100/100. All safeguards are active and the LaunchAgent is running.' },
          ]);
        } else if (currentSession.id === 'demo-2') {
          setMessages([
            { role: 'user', content: 'Simulators are spawning in a loop, help!' },
            { role: 'assistant', content: 'I detected 62 active simulator processes. Running sim-runaway-guard.sh to auto-terminate runaway runtimes and reclaim memory.' },
          ]);
        } else {
          setMessages([]);
        }
        return;
      }

      try {
        setIsLoadingMessages(true);
        setErrorMessage(null);
        const history = await listMessages(settings.gatewayUrl, currentSession.id, apiKey);
        setMessages(history);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadSessionHistory();
  }, [currentSession, isDemo, settings.gatewayUrl, apiKey]);

  // Handle creating a new chat session (scoped to active project)
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
        settings.gatewayUrl,
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
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create new session');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Handle sending a chat message
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSending) return;
    const userText = inputValue.trim();
    setInputValue('');
    haptics.light();

    let activeSess = currentSession;
    if (!activeSess) {
      // Auto-create session if none selected
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
            settings.gatewayUrl,
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
          setErrorMessage(err instanceof Error ? err.message : 'Failed to auto-create session');
          setIsSending(false);
          return;
        }
      }
    }

    // Add user message to UI immediately
    const userMessage: HermesMessage = {
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setToolStatus(null);

    setIsSending(true);

    if (isDemo) {
      // Simulate assistant reply typing delay
      setTimeout(() => {
        const assistantText = `[Demo Mode] I received: "${userText}". Since the gateway is in demo mode, I'm providing a mock reply. Let me know if you want to test live controls!`;
        const assistantMessage: HermesMessage = {
          role: 'assistant',
          content: assistantText,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setIsSending(false);
        haptics.success();
      }, 1500);
      return;
    }

    try {
      const assistantId = `asst-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', created_at: new Date().toISOString() },
      ]);

      const updateAssistant = (text: string) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m)),
        );
      };

      let assistantText = '';
      try {
        assistantText = await streamSessionChat(
          settings.gatewayUrl,
          activeSess.id,
          userText,
          apiKey,
          (evt) => {
            if (evt.event === 'assistant.delta' && typeof evt.data.delta === 'string') {
              assistantText += evt.data.delta;
              updateAssistant(assistantText);
            }
            if (evt.event.startsWith('tool.') && evt.data.tool_name) {
              setToolStatus(`${evt.event}: ${String(evt.data.tool_name)}`);
            }
          },
          workspacePrompt,
        );
      } catch (streamErr) {
        const response = await sendChatMessage(
          settings.gatewayUrl,
          activeSess.id,
          userText,
          apiKey,
          workspacePrompt,
        );
        assistantText = response.assistantText;
        updateAssistant(assistantText);
        if (streamErr instanceof Error && streamErr.message.includes('Streaming not supported')) {
          setToolStatus('Sync fallback (no stream on device)');
        }
      }

      if (!assistantText.trim()) {
        updateAssistant('(empty response)');
      }
      setToolStatus(null);
      haptics.success();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Premium Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title} testID="HERMES CHAT">💬 HERMES CHAT</Text>
          {isDemo && <Text style={styles.demoPill}>DEMO MODE</Text>}
        </View>

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

        {activeProject ? (
          <Text style={styles.workspacePath} numberOfLines={1}>
            {activeProject.workspacePath}
          </Text>
        ) : (
          <Text style={styles.workspaceHint}>
            Add a project to keep chats scoped to a Mac workspace.
          </Text>
        )}

        <TouchableOpacity
          style={styles.sessionSelector}
          onPress={() => {
            haptics.selection();
            setSessionModalVisible(true);
          }}
          testID="open-sessions-modal"
        >
          <Text style={styles.sessionSelectorText} numberOfLines={1}>
            {currentSession?.title ?? (activeProject ? `New ${activeProject.name} chat…` : 'Select or start a chat session...')}
          </Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Error Notification */}
        {errorMessage && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity onPress={() => setErrorMessage(null)}>
              <Text style={styles.errorClose}>×</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Message List */}
        {isLoadingMessages ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Fetching session history...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(_, index) => String(index)}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isUser = item.role === 'user';
              return (
                <View style={[styles.bubbleWrapper, isUser ? styles.bubbleUserWrapper : styles.bubbleAssistantWrapper]}>
                  <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
                    <Text style={[styles.bubbleText, isUser ? styles.bubbleUserText : styles.bubbleAssistantText]}>
                      {item.content}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <ScrollView contentContainerStyle={styles.emptyContainer} testID="chat-empty-state">
                <GlassCard style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Chat directly with Hermes</Text>
                  <Text style={styles.emptyBody}>
                    Ask questions, issue terminal commands, or request workspace analysis.
                    Each project keeps its own chat history and workspace context on your Mac.
                  </Text>
                  {!currentSession && (
                    <TouchableOpacity style={styles.newChatBtnInline} onPress={handleNewChat}>
                      <Text style={styles.newChatBtnInlineText}>Start New Session</Text>
                    </TouchableOpacity>
                  )}
                </GlassCard>
              </ScrollView>
            }
          />
        )}

        {toolStatus ? (
          <View style={styles.toolStatusRow}>
            <Text style={styles.toolStatusText}>{toolStatus}</Text>
          </View>
        ) : null}

        {/* Thinking Indicator */}
        {isSending && (
          <View style={styles.thinkingContainer} testID="thinking-indicator">
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.thinkingText}>Hermes is typing...</Text>
          </View>
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="Type a message to Hermes"
            placeholderTextColor={colors.textMuted}
            editable={!isSending}
            multiline
            testID="chat-input"
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputValue.trim() && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!inputValue.trim() || isSending}
            testID="chat-send-button"
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Sessions Selection Modal */}
      <Modal
        visible={sessionModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSessionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeProject ? `${activeProject.name} chats` : 'Select Chat Session'}
              </Text>
              <TouchableOpacity onPress={() => setSessionModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>

            {activeProject ? (
              <Text style={styles.modalSubtitle} numberOfLines={2}>
                Sessions in this project use workspace: {activeProject.workspacePath}
              </Text>
            ) : null}

            <TouchableOpacity style={styles.newChatBtn} onPress={handleNewChat} testID="modal-new-chat-button">
              <Text style={styles.newChatBtnText}>+ Start New Session</Text>
            </TouchableOpacity>

            {isLoadingSessions ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={visibleSessions}
                keyExtractor={(item) => item.id}
                style={styles.sessionList}
                renderItem={({ item }) => {
                  const isActive = currentSession?.id === item.id;
                  const lastActive = sessionLastActive(item);
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
                      <Text style={[styles.sessionItemTitle, isActive && styles.sessionItemTitleActive]}>
                        {item.title || 'Untitled Session'}
                      </Text>
                      {lastActive ? (
                        <Text style={styles.sessionItemTime}>
                          {new Date(lastActive).toLocaleDateString()}
                        </Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionItemActive: {
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
    borderRadius: 8,
    borderBottomColor: 'transparent',
  },
  sessionItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
    marginRight: 12,
  },
  sessionItemTitleActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  sessionItemTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
  emptySessionsText: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 20,
    fontSize: 12,
  },
});
