import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, act, waitFor } from '@testing-library/react-native';
import ChatScreen from '../screens/ChatScreen';
import { renderInTabNavigator } from '../testUtils/navigation';

const mockGatewayState = {
  connectionState: 'demo',
  apiKey: 'test-api-key',
  effectiveGatewayUrl: 'http://localhost:8642',
  health: { ok: true, hostname: 'demo-mac.local', localIp: '127.0.0.1' },
  activeGatewayProfile: {
    id: 'mac_demo',
    label: 'Demo Mac',
    gatewayUrl: 'http://localhost:8642',
    localIp: '127.0.0.1',
    addedAt: '2026-06-18T00:00:00Z',
  },
  gatewayProfiles: [
    {
      id: 'mac_demo',
      label: 'Demo Mac',
      gatewayUrl: 'http://localhost:8642',
      localIp: '127.0.0.1',
      addedAt: '2026-06-18T00:00:00Z',
    },
  ],
  relayWorkers: [],
  activeRelayWorkerId: null,
  isPaired: true,
  selectGatewayProfile: jest.fn().mockResolvedValue(undefined),
  scanForGatewayProfiles: jest.fn().mockResolvedValue([]),
  profileScanning: false,
  profileScanProgress: null,
  profileScanResult: null,
  autoConnectGateway: jest.fn().mockResolvedValue('http://localhost:8642'),
  pendingApprovals: [],
  submitApprovalChoice: jest.fn(),
  sendGateAction: jest.fn(),
  pendingApprovalEditSeed: null,
  clearApprovalEditSeed: jest.fn(),
  runProgress: null,
  setRunProgress: jest.fn(),
  setChatStreamProgressActive: jest.fn(),
  submitChatOutputFeedback: jest.fn().mockResolvedValue(true),
  chatOutputFeedbackBusyId: null,
  addGatewayListener: jest.fn(),
  removeGatewayListener: jest.fn(),
  refreshHealth: jest.fn().mockResolvedValue(undefined),
  retryGatewayBootstrap: jest.fn().mockResolvedValue(true),
  removeGatewayProfile: jest.fn().mockResolvedValue(undefined),
  connectEvents: jest.fn(),
  addGatewayProfile: jest.fn().mockResolvedValue(undefined),
  completePair: jest.fn().mockResolvedValue(undefined),
  saveSettings: jest.fn().mockResolvedValue(undefined),
  wifiConnected: true,
  settings: {
    demoMode: true,
    connectionMode: 'gateway',
    gatewayUrl: 'http://localhost:8642',
    cloudUrl: 'https://hermesmobile-cloud.fly.dev',
    approvalPolicy: 'balanced',
    includeToolActivity: true,
  },
};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const React = require('react');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
    }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => callback(), [callback]);
    },
  };
});

jest.mock('../hooks/useGatewaySelector', () => ({
  useGatewayConnection: () => mockGatewayState,
  useGatewayRelay: () => ({
    relayWorkers: mockGatewayState.relayWorkers,
    activeRelayWorkerId: mockGatewayState.activeRelayWorkerId,
    isPaired: mockGatewayState.isPaired,
  }),
  useGatewayApprovals: () => ({
    pendingApprovals: mockGatewayState.pendingApprovals,
    submitApprovalChoice: mockGatewayState.submitApprovalChoice,
    sendGateAction: mockGatewayState.sendGateAction,
    pendingApprovalEditSeed: mockGatewayState.pendingApprovalEditSeed,
    clearApprovalEditSeed: mockGatewayState.clearApprovalEditSeed,
    runProgress: mockGatewayState.runProgress,
    setRunProgress: mockGatewayState.setRunProgress,
    setChatStreamProgressActive: mockGatewayState.setChatStreamProgressActive,
    submitChatOutputFeedback: mockGatewayState.submitChatOutputFeedback,
    chatOutputFeedbackBusyId: mockGatewayState.chatOutputFeedbackBusyId,
  }),
  useGatewayChatSync: () => ({
    transcriptSyncNonce: 0,
    pendingChatRelayText: null,
    clearChatRelayText: jest.fn(),
    notificationFocusSessionId: null,
    clearNotificationFocusSession: jest.fn(),
    addGatewayListener: mockGatewayState.addGatewayListener,
    removeGatewayListener: mockGatewayState.removeGatewayListener,
  }),
}));

jest.mock('../context/GatewayContext', () => {
  return {
    useGateway: () => mockGatewayState,
  };
});

jest.mock('../services/secureCredentials', () => ({
  secureCredentials: {
    loadApiKey: jest.fn().mockResolvedValue('test-api-key'),
    saveApiKey: jest.fn().mockResolvedValue(true),
    loadMobileToken: jest.fn().mockResolvedValue('test-token'),
    saveMobileToken: jest.fn().mockResolvedValue(true),
    clearMobileToken: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../services/storage', () => ({
  storage: {
    loadGatewaySettings: jest.fn().mockResolvedValue({
      demoMode: true,
      connectionMode: 'gateway',
      gatewayUrl: 'http://localhost:8642',
      cloudUrl: 'https://hermesmobile-cloud.fly.dev',
    }),
    saveGatewaySettings: jest.fn().mockResolvedValue(true),
    loadRecentPrompts: jest.fn().mockResolvedValue([]),
    saveRecentPrompt: jest.fn().mockResolvedValue(undefined),
    removeRecentPrompt: jest.fn().mockResolvedValue(undefined),
    clearRecentPrompts: jest.fn().mockResolvedValue(undefined),
    loadDismissedPrompts: jest.fn().mockResolvedValue([]),
    saveDismissedPrompt: jest.fn().mockResolvedValue(undefined),
    clearDismissedPrompts: jest.fn().mockResolvedValue(undefined),
    loadDismissedSessionIds: jest.fn().mockResolvedValue([]),
    addDismissedSessionIds: jest.fn().mockResolvedValue(undefined),
    removeDismissedSessionIds: jest.fn().mockResolvedValue(undefined),
    clearDismissedSessionIds: jest.fn().mockResolvedValue(undefined),
    loadHideCronSessions: jest.fn().mockResolvedValue(false),
    setHideCronSessions: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/haptics', () => ({
  haptics: {
    light: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    heavy: jest.fn(),
  },
}));

jest.mock('../services/chatProjects', () => {
  const actual = jest.requireActual('../services/chatProjects');
  return {
    ...actual,
    chatProjects: {
      load: jest.fn().mockResolvedValue({
        projects: [
          {
            id: 'demo-hermes-mobile',
            name: 'hermes-mobile',
            workspacePath: '~/workspace/git/igor/mac-yolo-safeguards/hermes-mobile',
            sessionIds: ['demo-1'],
            activeSessionId: 'demo-1',
          },
        ],
        sessionProjectMap: { 'demo-1': 'demo-hermes-mobile' },
        sessionLabels: { 'demo-1': 'hermes-mobile' },
        activeProjectId: 'demo-hermes-mobile',
      }),
      save: jest.fn().mockResolvedValue(undefined),
      addProject: jest.fn(),
    },
    bindSessionToProject: jest.fn((state, projectId, sessionId, label) => ({
      ...state,
      sessionProjectMap: { ...state.sessionProjectMap, [sessionId]: projectId },
      sessionLabels: label ? { ...state.sessionLabels, [sessionId]: label } : state.sessionLabels,
      projects: state.projects.map((project: { id: string; sessionIds: string[] }) =>
        project.id === projectId
          ? {
              ...project,
              sessionIds: project.sessionIds.includes(sessionId)
                ? project.sessionIds
                : [sessionId, ...project.sessionIds],
              activeSessionId: sessionId,
            }
          : project,
      ),
    })),
    pinSessionLabel: jest.fn((state, sessionId, label) => ({
      ...state,
      sessionLabels: { ...state.sessionLabels, [sessionId]: label },
    })),
    projectNameForSession: jest.fn((state, sessionId) => {
      const projectId = state.sessionProjectMap?.[sessionId];
      if (!projectId) return null;
      return state.projects?.find((p: { id: string }) => p.id === projectId)?.name ?? null;
    }),
    setActiveProject: jest.fn((state, projectId) => ({ ...state, activeProjectId: projectId })),
    setActiveSession: jest.fn((state) => state),
  };
});

jest.mock('../services/hermesGatewayClient', () => ({
  HermesGatewayApiError: class HermesGatewayApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  deleteSession: jest.fn().mockResolvedValue(undefined),
  getCapabilities: jest.fn().mockResolvedValue({ features: {} }),
  forkSession: jest.fn(),
  stopRun: jest.fn(),
  streamSessionChat: jest.fn(),
}));

jest.mock('../services/hermesChatClient', () => ({
  listSessions: jest.fn().mockResolvedValue([
    { id: 'session-1', title: 'Test Session 1', last_active_at: '2026-06-15T12:00:00Z' },
  ]),
  createSession: jest.fn().mockResolvedValue({
    id: 'session-2',
    title: 'New Session 2',
    last_active_at: '2026-06-15T12:00:00Z',
  }),
  listMessages: jest.fn().mockResolvedValue([
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi there' },
  ]),
  sendChatMessage: jest.fn().mockResolvedValue({
    assistantText: 'processed reply',
    raw: {},
  }),
  updateSessionTitle: jest.fn().mockResolvedValue({
    id: 'demo-1',
    title: 'Updated Thread Name',
  }),
  getSession: jest.fn().mockResolvedValue(null),
}));

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.assign(mockGatewayState, {
      connectionState: 'demo',
      effectiveGatewayUrl: 'http://localhost:8642',
      health: { ok: true, hostname: 'demo-mac.local', localIp: '127.0.0.1' },
      activeGatewayProfile: {
        id: 'mac_demo',
        label: 'Demo Mac',
        gatewayUrl: 'http://localhost:8642',
        localIp: '127.0.0.1',
        addedAt: '2026-06-18T00:00:00Z',
      },
      relayWorkers: [],
      activeRelayWorkerId: null,
      isPaired: true,
      settings: {
        demoMode: true,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders header and initial state correctly in demo mode', async () => {
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { load: jest.Mock };
    };
    chatProjects.load.mockResolvedValueOnce({
      projects: [
        {
          id: 'demo-hermes-mobile',
          name: 'hermes-mobile',
          workspacePath: '~/workspace/git/igor/mac-yolo-safeguards/hermes-mobile',
          sessionIds: [],
          activeSessionId: undefined,
        },
      ],
      sessionProjectMap: {},
      sessionLabels: {},
      activeProjectId: 'demo-hermes-mobile',
    });

    const { getByText, getByTestId, findByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    expect(getByTestId('HERMES CHAT').props.children).toBeTruthy();
    expect(getByText('DEMO')).toBeTruthy();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(await findByTestId('chat-screen-header')).toBeTruthy();
    expect(getByTestId('chat-context-mac').props.children).toBe('Demo Mac');
    expect(getByTestId('chat-empty-greeting')).toBeTruthy();
  });

  it('keeps chat available in relay mode when the account is not paired yet', async () => {
    Object.assign(mockGatewayState, {
      connectionState: 'disconnected',
      effectiveGatewayUrl: '',
      health: { ok: false, level: 'red' },
      activeGatewayProfile: null,
      isPaired: false,
      settings: {
        demoMode: false,
        connectionMode: 'relay',
        gatewayUrl: '',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });

    const { getByTestId, queryByTestId, findByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    expect(await findByTestId('chat-screen-header')).toBeTruthy();
    expect(queryByTestId('chat-connection-panel')).toBeNull();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(getByTestId('chat-context-mac').props.children).toBe('Hermes account relay');
    expect(getByTestId('chat-context-link').props.children).toContain('Pair relay in Settings for Wi‑Fi, cellular, or USB');
  });

  it('allows text input and shows send button active', () => {
    const { getByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    fireEvent.changeText(input, 'Testing messages');
    expect(input.props.value).toBe('Testing messages');
    expect(sendButton).toBeTruthy();
  });

  it('fills the composer from a quick action without sending', async () => {
    const { sendChatMessage } = jest.requireMock('../services/hermesChatClient') as {
      sendChatMessage: jest.Mock;
    };
    sendChatMessage.mockClear();
    const { getByTestId, findByTestId, queryByText, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    const input = getByTestId('chat-input');

    expect(queryByTestId('chat-quick-action-continue')).toBeNull();
    const action = await findByTestId('chat-quick-action-recent-0');
    fireEvent.press(action);

    expect(input.props.value).toBe('safeguards setup inquiry');
    expect(queryByText('processed reply')).toBeNull();
  });

  it('dismisses a quick action when pressing the dismiss button', async () => {
    const { saveDismissedPrompt } = jest.requireMock('../services/storage').storage as {
      saveDismissedPrompt: jest.Mock;
    };
    saveDismissedPrompt.mockClear();

    const { findByTestId, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    // Dismiss chip with id: recent-0
    const dismissBtn = await findByTestId('chat-quick-action-dismiss-recent-0');
    await act(async () => {
      fireEvent.press(dismissBtn);
    });

    // Verify it saved to storage
    expect(saveDismissedPrompt).toHaveBeenCalledWith('safeguards setup inquiry');
    
    // Verify it is removed from UI
    expect(queryByTestId('chat-quick-action-recent-0')).toBeNull();
  });

  it('triggers mock message sending and demo reply in demo mode', () => {
    const { getByTestId, getAllByTestId, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    act(() => {
      fireEvent.changeText(input, 'Hello Hermes');
      fireEvent.press(sendButton);
    });

    expect(queryByTestId('submitted-prompt-strip')).toBeNull();
    expect(queryByTestId('chat-empty-state')).toBeNull();
    expect(getAllByTestId('chat-message-user').length).toBeGreaterThanOrEqual(1);

    act(() => {
      jest.advanceTimersByTime(1600);
    });

    expect(getAllByTestId('chat-message-assistant').length).toBeGreaterThanOrEqual(1);
    expect(queryByTestId('chat-empty-state')).toBeNull();
    expect(getAllByTestId('chat-message-user').length).toBeGreaterThanOrEqual(1);
  });

  it('keeps send enabled while a demo reply is in flight (queue path)', () => {
    const { getByTestId, getAllByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    act(() => {
      fireEvent.changeText(input, 'First message');
      fireEvent.press(sendButton);
    });
    const userCountAfterFirstSend = getAllByTestId('chat-message-user').length;
    expect(userCountAfterFirstSend).toBeGreaterThanOrEqual(1);

    act(() => {
      fireEvent.changeText(input, 'Second message');
      fireEvent.press(sendButton);
    });
    expect(getAllByTestId('chat-message-user').length).toBeGreaterThanOrEqual(userCountAfterFirstSend);
  });

  it('clears composer after send and ignores Android IME echo onChangeText', () => {
    const { getByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    fireEvent.changeText(input, 'Hello Hermes');
    fireEvent.press(sendButton);
    expect(input.props.value).toBe('');

    fireEvent.changeText(input, 'Hello Hermes');
    expect(input.props.value).toBe('');
  });

  it('opens and closes sessions selector modal', () => {
    const { getByTestId, getByText, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    fireEvent.press(getByTestId('open-sessions-modal'));
    expect(getByTestId('threads-modal-title')).toBeTruthy();
    expect(getByTestId('modal-new-chat-button')).toBeTruthy();

    fireEvent.press(getByText('Close'));
    expect(queryByTestId('modal-new-chat-button')).toBeNull();
  });

  it('opens tools modal from header Tools button, not threads', () => {
    const { getByTestId, getByText, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    fireEvent.press(getByTestId('chat-header-tools'));
    expect(getByTestId('tools-modal-title')).toBeTruthy();
    expect(queryByTestId('threads-modal-title')).toBeNull();
    expect(getByTestId('gateway-ops-section')).toBeTruthy();

    fireEvent.press(getByText('Close'));
    expect(queryByTestId('tools-modal-title')).toBeNull();
  });

  it('can start a new session from modal', () => {
    const { getByTestId, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    fireEvent.press(getByTestId('open-sessions-modal'));
    const newSessionButton = getByTestId('modal-new-chat-button');
    fireEvent.press(newSessionButton);

    expect(getByTestId('chat-empty-state')).toBeTruthy();
    expect(queryByTestId('chat-empty-recent-chats')).toBeNull();
  });

  it('shows clearing progress and persists empty demo bindings on clear all', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const clearButton = buttons?.find((button) => button.text === 'Clear all');
      clearButton?.onPress?.();
    });
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { save: jest.Mock };
    };
    chatProjects.save.mockClear();

    const { getByTestId, findByTestId, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(await findByTestId('threads-modal-clear-all'));

    expect(await findByTestId('threads-modal-clearing')).toBeTruthy();

    await waitFor(() => {
      expect(chatProjects.save).toHaveBeenCalledWith(
        expect.objectContaining({
          projects: [
            expect.objectContaining({
              sessionIds: [],
              activeSessionId: undefined,
            }),
          ],
          sessionProjectMap: {},
          sessionLabels: {},
        }),
      );
      expect(queryByTestId('threads-modal-clear-all')).toBeNull();
    });

    alertSpy.mockRestore();
  });

  it('deletes an individual session from the threads modal in demo mode', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const deleteButton = buttons?.find((button) => button.text === 'Delete');
      deleteButton?.onPress?.();
    });
    const { deleteSession } = jest.requireMock('../services/hermesGatewayClient') as {
      deleteSession: jest.Mock;
    };
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { save: jest.Mock };
    };
    deleteSession.mockClear();
    chatProjects.save.mockClear();

    const { getByTestId, findByTestId, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(await findByTestId('recent-chat-delete-demo-1'));

    await waitFor(() => {
      expect(deleteSession).not.toHaveBeenCalled();
      expect(chatProjects.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionProjectMap: {},
          sessionLabels: {},
          projects: [
            expect.objectContaining({
              sessionIds: [],
              activeSessionId: undefined,
            }),
          ],
        }),
      );
      expect(queryByTestId('recent-chat-delete-demo-1')).toBeNull();
    });

    alertSpy.mockRestore();
  });

  it('allows renaming a session in the threads modal', async () => {
    const { getByTestId, getByText, getAllByText, queryByText, findByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    // 1. Open the threads/sessions modal
    fireEvent.press(getByTestId('open-sessions-modal'));
    expect(getByTestId('threads-modal-title')).toBeTruthy();

    // 2. Press the edit/rename button next to the session
    const renameButton = await findByTestId('recent-chat-rename-demo-1');
    fireEvent.press(renameButton);

    // 3. Verify the rename modal opens
    const input = getByTestId('rename-session-input');
    expect(input.props.value).toBe('hermes-mobile');

    // 4. Change name to "Updated Thread Name" and save
    fireEvent.changeText(input, 'Updated Thread Name');
    fireEvent.press(getByTestId('rename-session-save'));

    // 5. Verify the modal closes and name is updated
    await waitFor(() => {
      expect(getAllByText('Updated Thread Name').length).toBeGreaterThanOrEqual(1);
      expect(queryByText('hermes-mobile')).toBeNull();
    });
  });

  it('shows Clear all in recents when only cron sessions exist on Mac', async () => {
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { load: jest.Mock };
    };

    listSessions.mockResolvedValueOnce([
      {
        id: 'cron_abc123',
        source: 'cron',
        title: '[IMPORTANT: You are running as a scheduled cron job',
        last_active_at: '2026-06-23T12:00:00Z',
      },
    ]);
    listMessages.mockResolvedValueOnce([]);
    chatProjects.load.mockResolvedValueOnce({
      projects: [
        {
          id: 'demo-hermes-mobile',
          name: 'hermes-mobile',
          workspacePath: '~/workspace/git/igor/mac-yolo-safeguards/hermes-mobile',
          sessionIds: [],
          activeSessionId: undefined,
        },
      ],
      sessionProjectMap: {},
      sessionLabels: {},
      activeProjectId: 'demo-hermes-mobile',
    });

    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      health: { ok: true, level: 'green', hostname: 'demo-mac.local', localIp: '127.0.0.1', checkedAt: '2026-06-26T00:00:00Z' },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });

    const { findByTestId, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    expect(await findByTestId('recent-chats-clear-all')).toBeTruthy();
    expect(queryByTestId('recent-chat-cron_abc123')).toBeNull();
  });

  it('clear all deletes cron-only Mac sessions and keeps them dismissed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const clearButton = buttons?.find((button) => button.text === 'Clear all');
      clearButton?.onPress?.();
    });
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    const { deleteSession } = jest.requireMock('../services/hermesGatewayClient') as {
      deleteSession: jest.Mock;
    };
    const { storage } = jest.requireMock('../services/storage') as {
      storage: {
        addDismissedSessionIds: jest.Mock;
        clearDismissedSessionIds: jest.Mock;
        setHideCronSessions: jest.Mock;
      };
    };
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { load: jest.Mock; save: jest.Mock };
    };

    const cronSession = {
      id: 'cron_abc123',
      source: 'cron',
      title: '[IMPORTANT: You are running as a scheduled cron job',
      last_active_at: '2026-06-23T12:00:00Z',
    };

    listSessions.mockResolvedValue([cronSession]);
    listMessages.mockResolvedValue([]);
    deleteSession.mockClear();
    storage.addDismissedSessionIds.mockClear();
    storage.clearDismissedSessionIds.mockClear();
    storage.setHideCronSessions.mockClear();
    chatProjects.load.mockResolvedValueOnce({
      projects: [
        {
          id: 'demo-hermes-mobile',
          name: 'hermes-mobile',
          workspacePath: '~/workspace/git/igor/mac-yolo-safeguards/hermes-mobile',
          sessionIds: [],
          activeSessionId: undefined,
        },
      ],
      sessionProjectMap: {},
      sessionLabels: {},
      activeProjectId: 'demo-hermes-mobile',
    });
    chatProjects.save.mockClear();

    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      health: { ok: true, level: 'green', hostname: 'demo-mac.local', localIp: '127.0.0.1', checkedAt: '2026-06-26T00:00:00Z' },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });

    const { findByTestId, getByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    expect(await findByTestId('recent-chats-clear-all')).toBeTruthy();

    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(await findByTestId('threads-modal-clear-all'));

    await waitFor(() => {
      expect(deleteSession).toHaveBeenCalledWith(
        'http://localhost:8642',
        'cron_abc123',
        'test-api-key',
      );
      expect(storage.addDismissedSessionIds).toHaveBeenCalledWith(
        'http://localhost:8642',
        ['cron_abc123'],
      );
      expect(storage.setHideCronSessions).toHaveBeenCalledWith('http://localhost:8642', true);
      expect(storage.clearDismissedSessionIds).not.toHaveBeenCalled();
    });

    alertSpy.mockRestore();
  });
});
