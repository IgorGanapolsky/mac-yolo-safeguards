import React from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import { fireEvent, act, waitFor, cleanup } from '@testing-library/react-native';
import ChatScreen from '../screens/ChatScreen';
import { renderInTabNavigator } from '../testUtils/navigation';

const mockGatewayState = {
  connectionState: 'demo',
  apiKey: 'test-api-key',
  effectiveGatewayUrl: 'http://localhost:8642',
  health: { ok: true, hostname: 'demo-mac.local', localIp: '127.0.0.1' },
  activeGatewayProfile: {
    id: 'mac_demo',
    label: 'Demo computer',
    gatewayUrl: 'http://localhost:8642',
    localIp: '127.0.0.1',
    addedAt: '2026-06-18T00:00:00Z',
  },
  gatewayProfiles: [
    {
      id: 'mac_demo',
      label: 'Demo computer',
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
  tailscaleDiscoveries: [],
  tailscaleDiscoveryProbing: false,
  addDiscoveredTailscaleComputer: jest.fn().mockResolvedValue(undefined),
  probeTailscaleComputers: jest.fn().mockResolvedValue(undefined),
  connectionHealAttempt: 6,
  connectionHealInFlight: false,
  connectionHealExhausted: true,
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
    saveLastSelectedProfileId: jest.fn().mockResolvedValue(undefined),
    loadLastSelectedProfileId: jest.fn().mockResolvedValue(null),
    loadApprovalsCount: jest.fn().mockResolvedValue(0),
    incrementApprovalsCount: jest.fn().mockResolvedValue(1),
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
    setActiveSession: actual.setActiveSession,
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
  clearAllSessions: jest.fn().mockResolvedValue(undefined),
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


async function confirmAlertButton(label: string) {
  await act(async () => {
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as
      | Array<{ text?: string; onPress?: () => void | Promise<void> }>
      | undefined;
    const button = buttons?.find((entry) => entry.text === label);
    await button?.onPress?.();
  });
}

async function flushChatScreenBoot() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderChatScreen() {
  const view = renderInTabNavigator(ChatScreen, 'Chat');
  await flushChatScreenBoot();
  await waitFor(() => {
    expect(view.getByTestId('chat-screen-header')).toBeTruthy();
  });
  return view;
}

async function drainChatScreenAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushPendingTimers() {
  if (!jest.isMockFunction(setTimeout)) {
    return;
  }
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
}

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    listSessions.mockReset();
    listMessages.mockReset();
    listSessions.mockResolvedValue([
      { id: 'session-1', title: 'Test Session 1', last_active_at: '2026-06-15T12:00:00Z' },
    ]);
    listMessages.mockResolvedValue([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { load: jest.Mock; save: jest.Mock };
    };
    chatProjects.load.mockReset();
    chatProjects.save.mockReset();
    chatProjects.load.mockResolvedValue({
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
    });
    chatProjects.save.mockResolvedValue(undefined);
    Object.assign(mockGatewayState, {
      connectionState: 'demo',
      effectiveGatewayUrl: 'http://localhost:8642',
      health: { ok: true, hostname: 'demo-mac.local', localIp: '127.0.0.1' },
      activeGatewayProfile: {
        id: 'mac_demo',
        label: 'Demo computer',
        gatewayUrl: 'http://localhost:8642',
        localIp: '127.0.0.1',
        addedAt: '2026-06-18T00:00:00Z',
      },
      gatewayProfiles: [
        {
          id: 'mac_demo',
          label: 'Demo computer',
          gatewayUrl: 'http://localhost:8642',
          localIp: '127.0.0.1',
          addedAt: '2026-06-18T00:00:00Z',
        },
      ],
      relayWorkers: [],
      activeRelayWorkerId: null,
      isPaired: true,
      refreshHealth: jest.fn().mockResolvedValue(undefined),
      selectGatewayProfile: jest.fn().mockResolvedValue(undefined),
      scanForGatewayProfiles: jest.fn().mockResolvedValue([]),
      autoConnectGateway: jest.fn().mockResolvedValue('http://localhost:8642'),
      submitChatOutputFeedback: jest.fn().mockResolvedValue(true),
      settings: {
        demoMode: true,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });
    const { storage } = jest.requireMock('../services/storage') as {
      storage: Record<string, jest.Mock>;
    };
    for (const fn of Object.values(storage)) {
      if (typeof fn?.mockClear === 'function') {
        fn.mockClear();
      }
    }
  });

  afterEach(async () => {
    await flushPendingTimers();
    await drainChatScreenAsync();
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
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

    const { getByText, getByTestId } = await renderChatScreen();

    expect(getByTestId('HERMES CHAT').props.children).toBeTruthy();
    expect(getByText('DEMO')).toBeTruthy();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(getByTestId('chat-screen-header')).toBeTruthy();
    expect(getByTestId('chat-context-mac').props.children).toBe('Demo computer');
    expect(getByTestId('chat-empty-greeting')).toBeTruthy();
  });

  it('keeps Android demo Chat foregrounded on hardware Back when no sheet is open', async () => {
    const originalOs = Platform.OS;
    Platform.OS = 'android';
    const remove = jest.fn();
    const addBackHandler = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockReturnValue({ remove } as never);

    try {
      await renderChatScreen();
      const handler = addBackHandler.mock.calls.find(
        ([eventName]) => eventName === 'hardwareBackPress',
      )?.[1] as (() => boolean) | undefined;

      expect(handler).toBeTruthy();
      expect(handler?.()).toBe(true);
    } finally {
      Platform.OS = originalOs;
    }
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

    const { getByTestId, queryByTestId } = await renderChatScreen();

    expect(queryByTestId('chat-connection-panel')).toBeNull();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(getByTestId('chat-context-mac').props.children).toBe('Hermes account relay');
    expect(getByTestId('chat-context-link').props.children).toContain('Pair relay in Settings for Wi‑Fi, cellular, or USB');
  });

  it('allows text input and shows send button active', async () => {
    const { getByTestId } = await renderChatScreen();
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    fireEvent.changeText(input, 'Testing messages');
    expect(input.props.value).toBe('Testing messages');
    expect(sendButton).toBeTruthy();
  });

  it('does not render bottom recent prompt chips above the composer', async () => {
    const { sendChatMessage } = jest.requireMock('../services/hermesChatClient') as {
      sendChatMessage: jest.Mock;
    };
    sendChatMessage.mockClear();
    const { getByTestId, queryByTestId } = await renderChatScreen();
    const input = getByTestId('chat-input');

    expect(queryByTestId('chat-quick-actions')).toBeNull();
    expect(queryByTestId('chat-quick-action-recent-0')).toBeNull();
    expect(queryByTestId('chat-quick-action-continue')).toBeNull();
    expect(input.props.value).toBe('');
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('shows the submitted prompt immediately instead of keeping recents visible', async () => {
    const { listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listMessages: jest.Mock;
    };
    const { streamSessionChat } = jest.requireMock('../services/hermesGatewayClient') as {
      streamSessionChat: jest.Mock;
    };
    let resolveStream: (value: string) => void = () => {};
    listMessages.mockResolvedValue([]);
    streamSessionChat.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveStream = resolve;
        }),
    );
    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      health: {
        ok: true,
        level: 'green',
        hostname: 'demo-mac.local',
        localIp: '127.0.0.1',
        directGatewayReachable: true,
        checkedAt: '2026-07-03T17:24:00Z',
      },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });
    const { getByTestId, getByText, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(getByTestId('chat-empty-recent-chats')).toBeTruthy();
    });

    act(() => {
      fireEvent.changeText(getByTestId('chat-input'), 'show this prompt now');
      fireEvent.press(getByTestId('chat-send-button'));
    });

    expect(getByText('show this prompt now')).toBeTruthy();
    expect(queryByTestId('chat-empty-recent-chats')).toBeNull();
    expect(queryByTestId('recent-chat-session-1')).toBeNull();
    await act(async () => {
      resolveStream('done');
    });
  });

  it('triggers mock message sending and demo reply in demo mode', async () => {
    const { getByTestId, getAllByTestId, queryByTestId } = await renderChatScreen();
    jest.useFakeTimers();
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    act(() => {
      fireEvent.changeText(input, 'Hello Hermes');
      fireEvent.press(sendButton);
    });

    expect(queryByTestId('submitted-prompt-strip')).toBeNull();
    expect(queryByTestId('chat-empty-state')).toBeNull();
    expect(queryByTestId('chat-empty-recent-chats')).toBeNull();
    expect(getAllByTestId('chat-message-user').length).toBeGreaterThanOrEqual(1);

    act(() => {
      jest.advanceTimersByTime(1600);
    });

    expect(getAllByTestId('chat-message-assistant').length).toBeGreaterThanOrEqual(1);
    expect(queryByTestId('chat-empty-state')).toBeNull();
    expect(getAllByTestId('chat-message-user').length).toBeGreaterThanOrEqual(1);
    await flushPendingTimers();
  });

  it('keeps send enabled while a demo reply is in flight (queue path)', async () => {
    const { getByTestId, getAllByTestId } = await renderChatScreen();
    jest.useFakeTimers();
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
    await flushPendingTimers();
  });

  it('hides recent thread cards after send on connected Mac with empty thread', async () => {
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    const { streamSessionChat } = jest.requireMock('../services/hermesGatewayClient') as {
      streamSessionChat: jest.Mock;
    };
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { load: jest.Mock };
    };

    listSessions.mockResolvedValue([
      {
        id: 'sess-diagnose',
        title: 'Diagnosing Hermes 20-Minu',
        last_active_at: '2026-06-23T12:00:00Z',
      },
      {
        id: 'sess-ibm',
        title: 'IBM Job Application',
        last_active_at: '2026-06-22T12:00:00Z',
      },
      {
        id: 'sess-empty',
        title: 'Empty active thread',
        last_active_at: '2026-06-24T12:00:00Z',
      },
    ]);
    listMessages.mockResolvedValue([]);
    chatProjects.load.mockResolvedValue({
      projects: [
        {
          id: 'demo-hermes-mobile',
          name: 'hermes-mobile',
          workspacePath: '~/workspace/git/igor/mac-yolo-safeguards/hermes-mobile',
          sessionIds: ['sess-empty'],
          activeSessionId: 'sess-empty',
        },
      ],
      sessionProjectMap: { 'sess-empty': 'demo-hermes-mobile' },
      sessionLabels: { 'sess-empty': 'hermes-mobile' },
      activeProjectId: 'demo-hermes-mobile',
    });
    streamSessionChat.mockResolvedValue('');

    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      health: {
        ok: true,
        level: 'green',
        hostname: 'demo-mac.local',
        localIp: '127.0.0.1',
        checkedAt: '2026-06-26T00:00:00Z',
      },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });

    const { getByTestId, getAllByTestId, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(queryByTestId('chat-empty-recent-chats')).toBeTruthy();
    });

    act(() => {
      fireEvent.changeText(getByTestId('chat-input'), 'Fix the send visibility bug');
      fireEvent.press(getByTestId('chat-send-button'));
    });

    await waitFor(() => {
      expect(queryByTestId('chat-empty-recent-chats')).toBeNull();
      expect(queryByTestId('chat-empty-state')).toBeNull();
      expect(getAllByTestId('chat-message-user').length).toBeGreaterThanOrEqual(1);
      expect(getByTestId('chat-input').props.placeholder).toMatch(/Sending|Add another message/i);
    });
  });

  it('clears composer after send and ignores Android IME echo onChangeText', async () => {
    const { getByTestId } = await renderChatScreen();
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    fireEvent.changeText(input, 'Hello Hermes');
    fireEvent.press(sendButton);
    expect(input.props.value).toBe('');

    fireEvent.changeText(input, 'Hello Hermes');
    expect(input.props.value).toBe('');
  });

  it('opens and closes sessions selector modal', async () => {
    const { getByTestId, getByText, queryByTestId } = await renderChatScreen();

    fireEvent.press(getByTestId('open-sessions-modal'));
    expect(getByTestId('threads-modal-title')).toBeTruthy();
    expect(getByTestId('modal-new-chat-button')).toBeTruthy();

    fireEvent.press(getByText('Close'));
    expect(queryByTestId('modal-new-chat-button')).toBeNull();
  });

  it('opens tools modal from header Tools button, not threads', async () => {
    const { getByTestId, getByText, queryByTestId } = await renderChatScreen();

    fireEvent.press(getByTestId('chat-header-tools'));
    expect(getByTestId('tools-modal-title')).toBeTruthy();
    expect(queryByTestId('threads-modal-title')).toBeNull();
    expect(getByTestId('gateway-ops-section')).toBeTruthy();

    fireEvent.press(getByText('Close'));
    expect(queryByTestId('tools-modal-title')).toBeNull();
  });

  it('explains how a new user adds a missing Tailscale Mac from the Mac picker', async () => {
    const { getByTestId, getByText } = await renderChatScreen();

    fireEvent.press(getByTestId('chat-context-mac-button'));

    expect(getByTestId('mac-picker-scroll')).toBeTruthy();
    expect(getByTestId('mac-picker-setup-help')).toBeTruthy();
    expect(getByText('Missing your other machine?')).toBeTruthy();
    expect(getByText(/Start Hermes on your other machine/)).toBeTruthy();
    expect(getByText(/Tailscale MagicDNS name or 100.x address in Settings/)).toBeTruthy();
  });

  it('dismisses the Mac picker when backdrop is pressed', async () => {
    const { getByTestId, queryByTestId } = await renderChatScreen();

    fireEvent.press(getByTestId('chat-context-mac-button'));
    expect(getByTestId('mac-picker-scroll')).toBeTruthy();

    fireEvent.press(getByTestId('mac-picker-modal-backdrop'));
    expect(queryByTestId('mac-picker-scroll')).toBeNull();
  });

  it('keeps an explicitly selected Mac primary instead of immediately auto-discovering over it', async () => {
    const autoConnectGateway = jest.fn().mockResolvedValue('http://10.2.29.103:8642');
    const selectGatewayProfile = jest.fn().mockResolvedValue(undefined);
    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      autoConnectGateway,
      selectGatewayProfile,
      activeGatewayProfile: {
        id: 'macbook',
        label: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://10.2.29.103:8642',
        localIp: '10.2.29.103',
        addedAt: '2026-07-02T00:00:00Z',
      },
      gatewayProfiles: [
        {
          id: 'macmini',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.87.85.85:8642',
          localIp: '100.87.85.85',
          addedAt: '2026-07-02T00:00:00Z',
        },
        {
          id: 'macbook',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://10.2.29.103:8642',
          localIp: '10.2.29.103',
          addedAt: '2026-07-02T00:00:00Z',
        },
      ],
    });

    const { getByTestId } = await renderChatScreen();
    autoConnectGateway.mockClear();

    fireEvent.press(getByTestId('chat-context-mac-button'));
    fireEvent.press(getByTestId('select-gateway-profile-macmini'));

    await waitFor(() => {
      expect(selectGatewayProfile).toHaveBeenCalledWith('macmini');
    });
    expect(autoConnectGateway).not.toHaveBeenCalled();
    expect(mockGatewayState.refreshHealth).toHaveBeenCalled();
  });

  it('scrolls to the latest message after switching computers from the Mac picker', async () => {
    const { FlatList } = require('react-native');
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { load: jest.Mock };
    };

    const macBookSession = {
      id: 'sess_macbook',
      title: 'MacBook chat',
      last_active_at: '2026-06-15T14:00:00Z',
    };
    const macMiniSession = {
      id: 'sess_macmini',
      title: 'Mac mini chat',
      last_active_at: '2026-06-15T15:00:00Z',
    };

    listSessions
      .mockResolvedValueOnce([macBookSession])
      .mockResolvedValue([macMiniSession]);
    listMessages
      .mockResolvedValueOnce([
        { role: 'user', content: 'on macbook' },
        { role: 'assistant', content: 'macbook reply' },
      ])
      .mockResolvedValue([
        { role: 'user', content: 'on mac mini' },
        { role: 'assistant', content: 'mac mini latest reply at the bottom' },
      ]);

    chatProjects.load.mockResolvedValue({
      projects: [
        {
          id: 'demo-hermes-mobile',
          name: 'hermes-mobile',
          workspacePath: '~/workspace/git/igor/mac-yolo-safeguards/hermes-mobile',
          sessionIds: ['sess_macbook'],
          activeSessionId: 'sess_macbook',
        },
      ],
      sessionProjectMap: { sess_macbook: 'demo-hermes-mobile' },
      sessionLabels: {},
      activeProjectId: 'demo-hermes-mobile',
    });

    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      effectiveGatewayUrl: 'http://10.2.29.103:8642',
      health: {
        ok: true,
        level: 'green',
        hostname: 'Igors-MacBook-Pro',
        localIp: '10.2.29.103',
        checkedAt: '2026-07-02T00:00:00Z',
      },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://10.2.29.103:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
      activeGatewayProfile: {
        id: 'macbook',
        label: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://10.2.29.103:8642',
        localIp: '10.2.29.103',
        addedAt: '2026-07-02T00:00:00Z',
      },
      gatewayProfiles: [
        {
          id: 'macmini',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.87.85.85:8642',
          localIp: '100.87.85.85',
          addedAt: '2026-07-02T00:00:00Z',
        },
        {
          id: 'macbook',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://10.2.29.103:8642',
          localIp: '10.2.29.103',
          addedAt: '2026-07-02T00:00:00Z',
        },
      ],
    });

    const { getByTestId, getByText } = await renderChatScreen();

    await waitFor(() => {
      expect(listMessages).toHaveBeenCalledWith(
        'http://10.2.29.103:8642',
        'sess_macbook',
        'test-api-key',
      );
    });

    scrollToEnd.mockClear();

    fireEvent.press(getByTestId('chat-context-mac-button'));
    fireEvent.press(getByTestId('select-gateway-profile-macmini'));

    await waitFor(() => {
      expect(getByText('mac mini latest reply at the bottom')).toBeTruthy();
    });

    await waitFor(() => {
      expect(
        scrollToEnd.mock.calls.some((call) => {
          const options = call[0] as { animated?: boolean } | undefined;
          return options?.animated === false;
        }),
      ).toBe(true);
    });

    scrollToEnd.mockRestore();
  });

  it('can start a new session from modal', async () => {
    const { getByTestId, queryByTestId } = await renderChatScreen();

    fireEvent.press(getByTestId('open-sessions-modal'));
    const newSessionButton = getByTestId('modal-new-chat-button');
    fireEvent.press(newSessionButton);

    expect(getByTestId('chat-empty-state')).toBeTruthy();
    expect(queryByTestId('chat-empty-recent-chats')).toBeNull();
  });

  it('shows clearing progress and persists empty demo bindings on clear all', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { save: jest.Mock };
    };
    chatProjects.save.mockClear();

    try {
      const { getByTestId, findByTestId, queryByTestId } = await renderChatScreen();
      fireEvent.press(getByTestId('open-sessions-modal'));
      fireEvent.press(await findByTestId('threads-modal-clear-all'));

      await act(async () => {
        const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as
          | Array<{ text?: string; onPress?: () => void | Promise<void> }>
          | undefined;
        const clearButton = buttons?.find((entry) => entry.text === 'Clear all');
        void clearButton?.onPress?.();
      });

      expect(getByTestId('threads-modal-clearing')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(50);
        await Promise.resolve();
      });

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
    } finally {
      alertSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('deletes an individual session from the threads modal in demo mode', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { deleteSession } = jest.requireMock('../services/hermesGatewayClient') as {
      deleteSession: jest.Mock;
    };
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { save: jest.Mock };
    };
    deleteSession.mockClear();
    chatProjects.save.mockClear();

    const { getByTestId, findByTestId, queryByTestId } = await renderChatScreen();
    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(await findByTestId('recent-chat-delete-demo-1'));
    await confirmAlertButton('Delete');

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
    const { getByTestId, getByText, getAllByText, queryByText, findByTestId } = await renderChatScreen();

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

    listSessions.mockResolvedValue([
      {
        id: 'cron_abc123',
        source: 'cron',
        title: '[IMPORTANT: You are running as a scheduled cron job',
        last_active_at: '2026-06-23T12:00:00Z',
      },
    ]);
    listMessages.mockResolvedValue([]);
    chatProjects.load.mockResolvedValue({
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

    const { findByTestId, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(queryByTestId('recent-chats-clear-all')).toBeTruthy();
    });
    expect(queryByTestId('recent-chat-cron_abc123')).toBeNull();
  });

  it('clear all deletes cron-only Mac sessions and keeps them dismissed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    const { deleteSession, clearAllSessions } = jest.requireMock('../services/hermesGatewayClient') as {
      deleteSession: jest.Mock;
      clearAllSessions: jest.Mock;
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
    clearAllSessions.mockClear();
    storage.addDismissedSessionIds.mockClear();
    storage.clearDismissedSessionIds.mockClear();
    storage.setHideCronSessions.mockClear();
    chatProjects.load.mockResolvedValue({
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

    const { findByTestId, getByTestId, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(queryByTestId('recent-chats-clear-all')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(await findByTestId('threads-modal-clear-all'));
    await confirmAlertButton('Clear all');

    await waitFor(() => {
      expect(clearAllSessions).toHaveBeenCalledWith(
        'http://localhost:8642',
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

  it('clear all hides mixed Mac threads when gateway delete fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
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
        loadDismissedSessionIds: jest.Mock;
      };
    };
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { load: jest.Mock };
    };

    const macSessions = [
      {
        id: 'cron_job',
        source: 'cron',
        title: '[IMPORTANT: You are running as a scheduled cron job',
        last_active_at: '2026-06-28T12:00:00Z',
      },
      {
        id: 'sess_print',
        title: 'Print money make money faster',
        last_active_at: '2026-06-27T12:00:00Z',
      },
      {
        id: 'sess_june15',
        title: 'Hermes Telegram Reliability YOLO Safeguar',
        last_active_at: '2026-06-15T12:00:00Z',
      },
    ];

    listSessions.mockResolvedValue(macSessions);
    listMessages.mockResolvedValue([]);
    deleteSession.mockRejectedValue(new Error('gateway refused'));
    storage.loadDismissedSessionIds.mockResolvedValue([]);
    storage.addDismissedSessionIds.mockClear();
    chatProjects.load.mockResolvedValue({
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

    const { getByTestId, findByTestId, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(queryByTestId('recent-chat-delete-sess_print')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(await findByTestId('threads-modal-clear-all'));
    await confirmAlertButton('Clear all');

    await waitFor(() => {
      expect(storage.addDismissedSessionIds).toHaveBeenCalledWith(
        'http://localhost:8642',
        ['cron_job', 'sess_print', 'sess_june15'],
      );
      expect(queryByTestId('threads-modal-clear-all')).toBeNull();
    });

    fireEvent.press(getByTestId('open-sessions-modal'));

    await waitFor(() => {
      expect(queryByTestId('recent-chat-delete-sess_print')).toBeNull();
      expect(queryByTestId('recent-chat-delete-sess_june15')).toBeNull();
      expect(queryByTestId('recent-chat-delete-cron_job')).toBeNull();
    });

    alertSpy.mockRestore();
  });

  it('clear all survives late dismissed-session hydration', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    const { storage } = jest.requireMock('../services/storage') as {
      storage: {
        addDismissedSessionIds: jest.Mock;
        loadDismissedSessionIds: jest.Mock;
      };
    };
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { load: jest.Mock };
    };

    let resolveDismissed: ((ids: string[]) => void) | undefined;
    const dismissedHydration = new Promise<string[]>((resolve) => {
      resolveDismissed = resolve;
    });
    storage.loadDismissedSessionIds.mockReturnValue(dismissedHydration);

    listSessions.mockResolvedValue([
      {
        id: 'sess_stale',
        title: 'Session 20260623 131050',
        last_active_at: '2026-06-23T13:10:50Z',
      },
    ]);
    listMessages.mockResolvedValue([]);
    storage.addDismissedSessionIds.mockClear();
    chatProjects.load.mockResolvedValue({
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

    const { getByTestId, findByTestId, queryByTestId } = await renderChatScreen();
    fireEvent.press(getByTestId('open-sessions-modal'));

    fireEvent.press(await findByTestId('threads-modal-clear-all'));
    await confirmAlertButton('Clear all');

    await waitFor(() => {
      expect(queryByTestId('threads-modal-clear-all')).toBeNull();
    });

    await act(async () => {
      resolveDismissed?.([]);
      await dismissedHydration;
    });

    fireEvent.press(getByTestId('open-sessions-modal'));

    await waitFor(() => {
      expect(queryByTestId('recent-chat-delete-sess_stale')).toBeNull();
    });

    alertSpy.mockRestore();
  });

  it('switches session and loads messages when a recent chat row is tapped', async () => {
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { load: jest.Mock; save: jest.Mock };
    };

    const macSessions = [
      {
        id: 'sess_print',
        title: 'Print money make money faster',
        last_active_at: '2026-06-28T12:00:00Z',
      },
      {
        id: 'sess_june15',
        title: 'Hermes Telegram Reliability YOLO Safeguar',
        last_active_at: '2026-06-15T12:00:00Z',
      },
    ];

    listSessions.mockResolvedValue(macSessions);
    listMessages.mockImplementation(async (_url: string, sessionId: string) => {
      if (sessionId === 'sess_june15') {
        return [
          { role: 'user', content: 'telegram reliability check', id: 'm-june-u' },
          { role: 'assistant', content: 'gateway is healthy', id: 'm-june-a' },
        ];
      }
      return [];
    });
    chatProjects.load.mockResolvedValue({
      projects: [
        {
          id: 'demo-hermes-mobile',
          name: 'hermes-mobile',
          workspacePath: '~/workspace/git/igor/mac-yolo-safeguards/hermes-mobile',
          sessionIds: ['sess_print', 'sess_june15'],
          activeSessionId: 'sess_print',
        },
      ],
      sessionProjectMap: {
        sess_print: 'demo-hermes-mobile',
        sess_june15: 'demo-hermes-mobile',
      },
      sessionLabels: {},
      activeProjectId: 'demo-hermes-mobile',
    });
    chatProjects.save.mockClear();

    Object.assign(mockGatewayState, {
      connectionState: 'disconnected',
      effectiveGatewayUrl: 'http://localhost:8642',
      health: {
        ok: true,
        level: 'green',
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '10.154.137.152',
        directGatewayReachable: true,
        checkedAt: '2026-06-28T19:00:00Z',
      },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
      activeGatewayProfile: {
        id: 'mac_igor',
        label: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://localhost:8642',
        localIp: '10.154.137.152',
        addedAt: '2026-06-18T00:00:00Z',
      },
    });

    const { findByText, getByTestId, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(getByTestId('recent-chat-sess_june15')).toBeTruthy();
    });

    fireEvent.press(getByTestId('recent-chat-sess_june15'));

    await waitFor(() => {
      expect(chatProjects.save).toHaveBeenCalledWith(
        expect.objectContaining({
          projects: [
            expect.objectContaining({
              activeSessionId: 'sess_june15',
            }),
          ],
        }),
      );
      expect(listMessages).toHaveBeenCalledWith(
        'http://localhost:8642',
        'sess_june15',
        'test-api-key',
      );
    });

    expect(await findByText('telegram reliability check')).toBeTruthy();
    expect(await findByText('gateway is healthy')).toBeTruthy();
    expect(queryByTestId('chat-empty-recent-chats')).toBeNull();
  });

  it('clear all empties messages and stays on new chat after gateway reload', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    const { deleteSession, clearAllSessions } = jest.requireMock('../services/hermesGatewayClient') as {
      deleteSession: jest.Mock;
      clearAllSessions: jest.Mock;
    };
    const { chatProjects } = jest.requireMock('../services/chatProjects') as {
      chatProjects: { load: jest.Mock; save: jest.Mock };
    };

    const macSessions = [
      {
        id: 'sess_june15',
        title: 'Hermes Telegram Reliability YOLO Safeguar',
        last_active_at: '2026-06-15T12:00:00Z',
      },
    ];

    listSessions.mockResolvedValue(macSessions);
    listMessages.mockResolvedValue([
      { role: 'user', content: 'old telegram thread' },
      { role: 'assistant', content: 'still here before clear' },
    ]);
    deleteSession.mockClear();
    clearAllSessions.mockClear();
    chatProjects.load.mockResolvedValue({
      projects: [
        {
          id: 'demo-hermes-mobile',
          name: 'hermes-mobile',
          workspacePath: '~/workspace/git/igor/mac-yolo-safeguards/hermes-mobile',
          sessionIds: ['sess_june15'],
          activeSessionId: 'sess_june15',
        },
      ],
      sessionProjectMap: { sess_june15: 'demo-hermes-mobile' },
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

    const { getByTestId, findByTestId, queryByText } = await renderChatScreen();

    await waitFor(() => {
      expect(queryByText('still here before clear')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(await findByTestId('threads-modal-clear-all'));
    await confirmAlertButton('Clear all');

    await waitFor(() => {
      expect(clearAllSessions).toHaveBeenCalledWith(
        'http://localhost:8642',
        'test-api-key',
      );
      expect(queryByText('still here before clear')).toBeNull();
      expect(getByTestId('chat-empty-state')).toBeTruthy();
      expect(chatProjects.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionProjectMap: {},
          projects: [
            expect.objectContaining({
              sessionIds: [],
              activeSessionId: undefined,
            }),
          ],
        }),
      );
    });

    listSessions.mockResolvedValue(macSessions);
    listMessages.mockResolvedValue([
      { role: 'user', content: 'old telegram thread' },
      { role: 'assistant', content: 'still here before clear' },
    ]);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryByText('still here before clear')).toBeNull();

    alertSpy.mockRestore();
  });
});
