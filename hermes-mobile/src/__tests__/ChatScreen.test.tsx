import React from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import { fireEvent, act, waitFor, cleanup, within } from '@testing-library/react-native';
import ChatScreen, {
  resolveEffectiveKeyboardInset,
  shouldIgnoreKeyboardHide,
  shouldClearKeyboardScreenVisible,
} from '../screens/ChatScreen';
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
  selectGatewayProfile: jest.fn().mockResolvedValue(true),
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
    loadHideAutomationSessions: jest.fn().mockResolvedValue(false),
    setHideAutomationSessions: jest.fn().mockResolvedValue(undefined),
    saveLastSelectedProfileId: jest.fn().mockResolvedValue(undefined),
    loadLastSelectedProfileId: jest.fn().mockResolvedValue(null),
    loadApprovalsCount: jest.fn().mockResolvedValue(0),
    incrementApprovalsCount: jest.fn().mockResolvedValue(1),
    saveLastSessionForComputer: jest.fn().mockResolvedValue(undefined),
    loadLastSessionForComputer: jest.fn().mockResolvedValue(null),
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

jest.mock('../services/vaultProjects', () => ({
  fetchVaultProjectCatalog: jest.fn().mockResolvedValue(null),
  fetchVaultProjectCatalogFromHost: jest.fn().mockResolvedValue(null),
  VAULT_PROJECTS_PATH: '/vault-projects.json',
}));

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
  getObsidianProjects: jest.fn().mockResolvedValue([]),
  getObsidianAgents: jest.fn().mockResolvedValue([]),
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
  createSessionWithUniqueTitle: jest.fn().mockResolvedValue({
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

jest.mock('../services/gatewayDiscovery', () => ({
  probeLiveUsbGateway: jest.fn().mockResolvedValue(null),
  pairServerHostFromGatewayUrl: jest.requireActual('../services/gatewayDiscovery')
    .pairServerHostFromGatewayUrl,
  resolvePairServerSetupParams: jest.fn().mockResolvedValue(null),
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

function countPromptUserBubbles(getAllByTestId: (testId: string) => unknown[], prompt: string): number {
  return getAllByTestId('chat-message-user').filter((bubble) =>
    within(bubble as Parameters<typeof within>[0]).queryByText(prompt),
  ).length;
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
    mockGatewayState.runProgress = null;
    mockGatewayState.setRunProgress = jest.fn((value) => {
      if (typeof value === 'function') {
        mockGatewayState.runProgress = value(mockGatewayState.runProgress);
      } else {
        mockGatewayState.runProgress = value;
      }
    });
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
      selectGatewayProfile: jest.fn().mockResolvedValue(true),
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

  it('runs reconnect heal when Computer tile is pressed while disconnected', async () => {
    mockGatewayState.retryGatewayBootstrap.mockClear();
    mockGatewayState.scanForGatewayProfiles.mockClear();
    mockGatewayState.autoConnectGateway.mockClear();
    mockGatewayState.refreshHealth.mockClear();
    mockGatewayState.connectEvents.mockClear();

    Object.assign(mockGatewayState, {
      connectionState: 'disconnected',
      connectionHealAttempt: 6,
      connectionHealInFlight: false,
      effectiveGatewayUrl: 'http://100.94.135.78:8642',
      health: {
        ok: false,
        level: 'red',
        hostname: 'Igors-Mac-mini',
        directGatewayReachable: false,
        checkedAt: '2026-07-08T12:00:00Z',
      },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://100.94.135.78:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
      activeGatewayProfile: {
        id: 'mac_mini',
        label: 'Igors-Mac-mini',
        gatewayUrl: 'http://100.94.135.78:8642',
        addedAt: '2026-06-18T00:00:00Z',
      },
    });

    const { getByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(getByTestId('command-center-mac-tile')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId('command-center-mac-tile'));
      await drainChatScreenAsync();
    });

    expect(mockGatewayState.scanForGatewayProfiles).toHaveBeenCalled();
    expect(mockGatewayState.autoConnectGateway).toHaveBeenCalled();
    expect(mockGatewayState.retryGatewayBootstrap).toHaveBeenCalled();
    expect(mockGatewayState.refreshHealth).toHaveBeenCalled();
    expect(mockGatewayState.connectEvents).toHaveBeenCalled();
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
    const { getByTestId, getAllByText, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(getByTestId('chat-empty-recent-chats')).toBeTruthy();
    });

    act(() => {
      fireEvent.changeText(getByTestId('chat-input'), 'show this prompt now');
      fireEvent.press(getByTestId('chat-send-button'));
    });

    expect(getAllByText('show this prompt now').length).toBeGreaterThanOrEqual(1);
    expect(queryByTestId('chat-empty-recent-chats')).toBeNull();
    expect(queryByTestId('recent-chat-session-1')).toBeNull();
    await act(async () => {
      resolveStream('done');
    });
  });

  it('shows run progress banner immediately after send before stream events', async () => {
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
        checkedAt: '2026-07-08T11:39:00Z',
      },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });
    const { getByTestId } = await renderChatScreen();

    act(() => {
      fireEvent.changeText(getByTestId('chat-input'), 'Print money make money faster');
      fireEvent.press(getByTestId('chat-send-button'));
    });

    await waitFor(() => {
      expect(mockGatewayState.setRunProgress).toHaveBeenCalled();
      expect(getByTestId('run-progress-banner')).toBeTruthy();
      expect(getByTestId('run-progress-detail').props.children).toBe('Delivering your message…');
    });

    await act(async () => {
      resolveStream('Hermes reply after slow gateway');
    });
  });

  it('does not show raw tool or browser console errors in the chat transcript', async () => {
    const { listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listMessages: jest.Mock;
    };
    listMessages.mockResolvedValue([
      { role: 'user', content: 'Are you lost?' },
      {
        role: 'tool',
        content:
          '{"success":false,"error":"Uncaught: SyntaxError: Identifier \\"result\\" has already been declared","tool":"browser_console"}',
        created_at: '2026-07-02T21:31:00Z',
      },
      { role: 'assistant', content: 'I will recover without showing internal debug payloads.' },
    ]);
    Object.assign(mockGatewayState, {
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
        includeToolActivity: true,
      },
      connectionState: 'connected',
      health: { ok: true, level: 'green', hostname: 'demo-mac.local' },
    });

    const { getByText, queryByText } = await renderChatScreen();

    expect(getByText('Are you lost?')).toBeTruthy();
    expect(getByText('I will recover without showing internal debug payloads.')).toBeTruthy();
    expect(queryByText(/SyntaxError/)).toBeNull();
    expect(queryByText(/\[tool/)).toBeNull();
  });

  it('creates new mobile sessions with the first prompt as the title', async () => {
    const { createSessionWithUniqueTitle } = jest.requireMock('../services/hermesChatClient') as {
      createSessionWithUniqueTitle: jest.Mock;
    };
    const { streamSessionChat } = jest.requireMock('../services/hermesGatewayClient') as {
      streamSessionChat: jest.Mock;
    };
    createSessionWithUniqueTitle.mockClear();
    createSessionWithUniqueTitle.mockResolvedValueOnce({
      id: 'session-first-prompt',
      title: 'New mobile session #4',
      last_active_at: '2026-07-03T20:30:00Z',
    });
    streamSessionChat.mockImplementation(
      (
        _gatewayUrl: string,
        _sessionId: string,
        _text: string,
        _apiKey: string,
        onEvent: (event: { event: string; data: Record<string, unknown> }) => void,
        _systemPrompt: string,
        onOpen?: () => void,
      ) => {
        onOpen?.();
        onEvent({ event: 'assistant.delta', data: { delta: 'Working on it.' } });
        return Promise.resolve('Working on it.');
      },
    );
    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      health: { ok: true, level: 'green', hostname: 'demo-mac.local' },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });

    const { getByTestId, queryByTestId } = await renderChatScreen();
    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(getByTestId('modal-new-chat-button'));
    expect(queryByTestId('modal-new-chat-button')).toBeNull();

    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), 'Fix Hermes mobile transcript noise now');
      fireEvent.press(getByTestId('chat-send-button'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(createSessionWithUniqueTitle).toHaveBeenCalledWith(
        'http://localhost:8642',
        'test-api-key',
        'Fix Hermes mobile transcript noise now',
        expect.any(String),
      );
    });
  });

  it('resumes an existing thread when the first prompt title already exists', async () => {
    const { listSessions, createSessionWithUniqueTitle } = jest.requireMock(
      '../services/hermesChatClient',
    ) as {
      listSessions: jest.Mock;
      createSessionWithUniqueTitle: jest.Mock;
    };
    const { streamSessionChat } = jest.requireMock('../services/hermesGatewayClient') as {
      streamSessionChat: jest.Mock;
    };
    listSessions.mockResolvedValueOnce([
      {
        id: 'existing-print-money',
        title: 'Print money make money faster',
        last_active_at: '2026-07-07T16:00:00.000Z',
      },
    ]);
    createSessionWithUniqueTitle.mockClear();
    streamSessionChat.mockImplementation(
      (
        _gatewayUrl: string,
        _sessionId: string,
        _text: string,
        _apiKey: string,
        onEvent: (event: { event: string; data: Record<string, unknown> }) => void,
        _systemPrompt: string,
        onOpen?: () => void,
      ) => {
        onOpen?.();
        onEvent({ event: 'assistant.delta', data: { delta: 'Continuing prior thread.' } });
        return Promise.resolve('Continuing prior thread.');
      },
    );
    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      health: { ok: true, level: 'green', hostname: 'demo-mac.local' },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });

    const { getByTestId } = await renderChatScreen();
    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(getByTestId('modal-new-chat-button'));

    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), 'Print money make money faster');
      fireEvent.press(getByTestId('chat-send-button'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(createSessionWithUniqueTitle).not.toHaveBeenCalled();
      expect(streamSessionChat).toHaveBeenCalledWith(
        'http://localhost:8642',
        'existing-print-money',
        'Print money make money faster',
        'test-api-key',
        expect.any(Function),
        expect.any(String),
        expect.any(Function),
      );
    });
  });

  it('auto-creates a fresh session and retries once when the gateway reports the target session was removed', async () => {
    const { listSessions, createSessionWithUniqueTitle, sendChatMessage } = jest.requireMock(
      '../services/hermesChatClient',
    ) as {
      listSessions: jest.Mock;
      createSessionWithUniqueTitle: jest.Mock;
      sendChatMessage: jest.Mock;
    };
    const { streamSessionChat } = jest.requireMock('../services/hermesGatewayClient') as {
      streamSessionChat: jest.Mock;
    };
    // Stale local cache still lists a thread the restarted gateway has dropped.
    listSessions.mockResolvedValueOnce([
      {
        id: 'stale-removed',
        title: 'Print money make money faster',
        last_active_at: '2026-07-07T16:00:00.000Z',
      },
    ]);
    createSessionWithUniqueTitle.mockClear();
    createSessionWithUniqueTitle.mockResolvedValueOnce({
      id: 'fresh-session',
      title: 'Print money make money faster',
      last_active_at: '2026-07-07T17:00:00.000Z',
    });
    sendChatMessage.mockClear();
    streamSessionChat.mockReset();
    streamSessionChat.mockImplementation(
      (
        _gatewayUrl: string,
        sessionId: string,
        _text: string,
        _apiKey: string,
        onEvent: (event: { event: string; data: Record<string, unknown> }) => void,
        _systemPrompt: string,
        onOpen?: () => void,
      ) => {
        if (sessionId === 'stale-removed') {
          return Promise.reject(
            new Error(JSON.stringify({ error: { code: 'session_not_found', message: 'gone' } })),
          );
        }
        onOpen?.();
        onEvent({ event: 'assistant.delta', data: { delta: 'Recovered reply.' } });
        return Promise.resolve('Recovered reply.');
      },
    );
    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      health: { ok: true, level: 'green', hostname: 'demo-mac.local' },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });

    const { getByTestId, queryByText } = await renderChatScreen();
    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(getByTestId('modal-new-chat-button'));

    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), 'Print money make money faster');
      fireEvent.press(getByTestId('chat-send-button'));
      await Promise.resolve();
    });

    // Exactly one auto-create + retry: the second stream targets the NEW id.
    await waitFor(() => {
      expect(createSessionWithUniqueTitle).toHaveBeenCalledTimes(1);
      expect(streamSessionChat).toHaveBeenCalledTimes(2);
    });
    expect(streamSessionChat.mock.calls[0][1]).toBe('stale-removed');
    expect(streamSessionChat.mock.calls[1][1]).toBe('fresh-session');
    // The removed-session error must NOT trigger the raw send fallback path.
    expect(sendChatMessage).not.toHaveBeenCalled();
    // The transparent recovery must not surface the red "removed" banner.
    expect(queryByText(/That chat was removed or your computer restarted/)).toBeNull();
  });

  it('surfaces the removed-session error only if the auto-retry also fails', async () => {
    const { listSessions, createSessionWithUniqueTitle } = jest.requireMock(
      '../services/hermesChatClient',
    ) as {
      listSessions: jest.Mock;
      createSessionWithUniqueTitle: jest.Mock;
    };
    const { streamSessionChat } = jest.requireMock('../services/hermesGatewayClient') as {
      streamSessionChat: jest.Mock;
    };
    listSessions.mockResolvedValueOnce([
      {
        id: 'stale-removed',
        title: 'Print money make money faster',
        last_active_at: '2026-07-07T16:00:00.000Z',
      },
    ]);
    createSessionWithUniqueTitle.mockClear();
    createSessionWithUniqueTitle.mockResolvedValueOnce({
      id: 'fresh-session',
      title: 'Print money make money faster',
      last_active_at: '2026-07-07T17:00:00.000Z',
    });
    streamSessionChat.mockReset();
    streamSessionChat.mockImplementation(() =>
      Promise.reject(
        new Error(JSON.stringify({ error: { code: 'session_not_found', message: 'gone' } })),
      ),
    );
    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      health: { ok: true, level: 'green', hostname: 'demo-mac.local' },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });

    const { getByTestId, findByText } = await renderChatScreen();
    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(getByTestId('modal-new-chat-button'));

    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), 'Print money make money faster');
      fireEvent.press(getByTestId('chat-send-button'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(createSessionWithUniqueTitle).toHaveBeenCalledTimes(1);
      expect(streamSessionChat).toHaveBeenCalledTimes(2);
    });
    expect(await findByText(/That chat was removed or your computer restarted/)).toBeTruthy();
  });

  it('does not render tool transcript cards even when old settings enable tool activity', async () => {
    const { listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listMessages: jest.Mock;
    };
    listMessages.mockResolvedValue([
      { id: 'u1', role: 'user', content: 'Are you stuck?' },
      {
        id: 'tool1',
        role: 'tool',
        content: '{"name":"terminal","command":"cat /tmp/internal-output"}',
      },
      { id: 'a1', role: 'assistant', content: 'Visible user answer' },
    ]);
    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      health: {
        ok: true,
        level: 'green',
        hostname: 'demo-mac.local',
        localIp: '127.0.0.1',
        checkedAt: '2026-07-04T00:00:00Z',
      },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
        includeToolActivity: true,
      },
    });

    const { getByText, queryByText, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(getByText('Visible user answer')).toBeTruthy();
    });
    expect(queryByText(/internal-output/)).toBeNull();
    expect(queryByText(/Geek details/)).toBeNull();
    expect(queryByTestId('tool-call-terminal')).toBeNull();
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

    // Optimistic bubble is the sole prompt copy — strip must not duplicate it.
    expect(getAllByTestId('chat-message-user').length).toBeGreaterThanOrEqual(1);
    expect(queryByTestId('submitted-prompt-strip')).toBeNull();
    expect(queryByTestId('chat-empty-state')).toBeNull();
    expect(queryByTestId('chat-empty-recent-chats')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(1600);
    });

    expect(getAllByTestId('chat-message-assistant').length).toBeGreaterThanOrEqual(1);
    expect(queryByTestId('chat-empty-state')).toBeNull();
    expect(getAllByTestId('chat-message-user').length).toBeGreaterThanOrEqual(1);
    await flushPendingTimers();
  });

  it('disables send while a demo reply is in flight', async () => {
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
    expect(getAllByTestId('chat-message-user').length).toBe(userCountAfterFirstSend);

    act(() => {
      jest.advanceTimersByTime(1600);
    });
    await flushPendingTimers();
  });

  it('keeps one user bubble when the same prompt re-enters while send is pending', async () => {
    const { getByTestId, getAllByTestId, queryByTestId } = await renderChatScreen();
    jest.useFakeTimers();
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');
    const prompt = 'make money faster';

    await act(async () => {
      fireEvent.changeText(input, prompt);
      fireEvent.press(sendButton);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(countPromptUserBubbles(getAllByTestId, prompt)).toBe(1);
    });
    expect(queryByTestId('submitted-prompt-strip')).toBeNull();

    await act(async () => {
      fireEvent.changeText(input, prompt);
      fireEvent.press(sendButton);
      await Promise.resolve();
    });

    expect(countPromptUserBubbles(getAllByTestId, prompt)).toBe(1);
    await flushPendingTimers();
  });

  it('accepts the same prompt again after the prior send completes', async () => {
    const { getByTestId, getAllByTestId, queryByTestId } = await renderChatScreen();
    jest.useFakeTimers();
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');
    const prompt = 'print money, make money faster. Use Data Science, ML and Agentic RAG.';

    await act(async () => {
      fireEvent.changeText(input, prompt);
      fireEvent.press(sendButton);
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(1600);
    });
    await act(async () => {
      fireEvent.changeText(input, prompt);
      fireEvent.press(sendButton);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(countPromptUserBubbles(getAllByTestId, prompt)).toBeGreaterThanOrEqual(2);
    });
    expect(queryByTestId('submitted-prompt-strip')).toBeNull();
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
      expect(queryByTestId('submitted-prompt-strip')).toBeNull();
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
    const selectGatewayProfile = jest.fn().mockResolvedValue(true);
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
      expect(selectGatewayProfile).toHaveBeenCalledWith(
        'macmini',
        expect.objectContaining({
          ensureProfile: expect.objectContaining({ id: 'macmini' }),
        }),
      );
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

  it('preserves typed composer text when Start fresh chat opens a new session', async () => {
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    listSessions.mockResolvedValue([
      {
        id: 'mega-session-1',
        title: 'make money faster',
        last_active_at: '2026-07-13T18:04:00Z',
        input_tokens: 974_489,
        output_tokens: 0,
      },
    ]);
    listMessages.mockResolvedValue([
      { role: 'assistant', content: 'Your computer is processing a very large session.' },
    ]);
    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      health: { ok: true, level: 'green', hostname: 'demo-mac.local' },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://localhost:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });

    const { getByTestId, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(getByTestId('mega-session-banner')).toBeTruthy();
      expect(getByTestId('mega-session-start-fresh-chat')).toBeTruthy();
    });

    const draft = 'typeable-probe-probe-2-1';
    fireEvent.changeText(getByTestId('chat-input'), draft);
    expect(getByTestId('chat-input').props.value).toBe(draft);

    await act(async () => {
      fireEvent.press(getByTestId('mega-session-start-fresh-chat'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(queryByTestId('mega-session-banner')).toBeNull();
      expect(getByTestId('chat-input').props.value).toBe(draft);
    });
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
        setHideAutomationSessions: jest.Mock;
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
    storage.setHideAutomationSessions.mockClear();
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
        expect.arrayContaining(['mac_demo', 'http://localhost:8642']),
        ['cron_abc123'],
        'http://localhost:8642',
      );
      expect(storage.setHideCronSessions).toHaveBeenCalledWith(
        expect.arrayContaining(['mac_demo', 'http://localhost:8642']),
        true,
        'http://localhost:8642',
      );
      expect(storage.setHideAutomationSessions).toHaveBeenCalledWith(
        expect.arrayContaining(['mac_demo', 'http://localhost:8642']),
        true,
        'http://localhost:8642',
      );
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
        expect.arrayContaining(['mac_demo', 'http://localhost:8642']),
        ['cron_job', 'sess_print', 'sess_june15'],
        'http://localhost:8642',
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

  it('clear all keeps threads hidden after gateway URL drift (USB to Tailscale)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { listSessions, listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      listMessages: jest.Mock;
    };
    const { clearAllSessions } = jest.requireMock('../services/hermesGatewayClient') as {
      clearAllSessions: jest.Mock;
    };
    const { storage } = jest.requireMock('../services/storage') as {
      storage: {
        addDismissedSessionIds: jest.Mock;
        loadDismissedSessionIds: jest.Mock;
      };
    };

    const macSessions = [
      {
        id: 'sess_stale',
        title: 'Session 20260623 131050',
        last_active_at: '2026-06-23T13:10:50Z',
      },
    ];

    listSessions.mockResolvedValue(macSessions);
    listMessages.mockResolvedValue([]);
    clearAllSessions.mockResolvedValue(undefined);
    storage.loadDismissedSessionIds.mockResolvedValue([]);
    storage.addDismissedSessionIds.mockClear();

    Object.assign(mockGatewayState, {
      connectionState: 'connected',
      effectiveGatewayUrl: 'http://100.94.135.78:8642',
      activeGatewayProfile: {
        id: 'mac_100_94_135_78',
        label: 'Igors-Mac-mini',
        hostname: 'Igors-Mac-mini',
        gatewayUrl: 'http://100.94.135.78:8642',
        addedAt: '2026-06-28T00:00:01Z',
      },
      health: {
        ok: true,
        level: 'green',
        hostname: 'Igors-Mac-mini',
        localIp: '100.94.135.78',
        checkedAt: '2026-06-26T00:00:00Z',
      },
      settings: {
        demoMode: false,
        connectionMode: 'gateway',
        gatewayUrl: 'http://100.94.135.78:8642',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        approvalPolicy: 'balanced',
      },
    });

    const { getByTestId, findByTestId, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(queryByTestId('recent-chat-delete-sess_stale')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-sessions-modal'));
    fireEvent.press(await findByTestId('threads-modal-clear-all'));
    await confirmAlertButton('Clear all');

    await waitFor(() => {
      expect(storage.addDismissedSessionIds).toHaveBeenCalledWith(
        expect.arrayContaining(['host:igors-mac-mini']),
        ['sess_stale'],
        'http://100.94.135.78:8642',
      );
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

  it('shows session-loading spinner immediately when a recent thread is tapped', async () => {
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
    let resolveJune: ((value: unknown) => void) | undefined;
    const juneHistory = new Promise((resolve) => {
      resolveJune = resolve;
    });
    listMessages.mockImplementation(async (_url: string, sessionId: string) => {
      if (sessionId === 'sess_june15') {
        return juneHistory;
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
      expect(getByTestId('chat-session-loading')).toBeTruthy();
      expect(queryByTestId('chat-empty-recent-chats')).toBeNull();
    });

    await act(async () => {
      resolveJune?.([
        { role: 'user', content: 'telegram reliability check', id: 'm-june-u' },
        { role: 'assistant', content: 'gateway is healthy', id: 'm-june-a' },
      ]);
    });

    expect(await findByText('telegram reliability check')).toBeTruthy();
    await waitFor(() => {
      expect(queryByTestId('chat-session-loading')).toBeNull();
    });
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

  describe('Obsidian vault project picker', () => {
    it('shows active project chip and opens vault project modal', async () => {
      const { getByTestId } = await renderChatScreen();

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(getByTestId('vault-project-picker-chip')).toBeTruthy();
      expect(getByTestId('chat-header-project-picker')).toBeTruthy();

      fireEvent.press(getByTestId('vault-project-picker-chip'));

      await waitFor(() => {
        expect(getByTestId('project-modal')).toBeTruthy();
        expect(getByTestId('project-pick-demo-hermes-mobile')).toBeTruthy();
      });
    });
  });

  it('shows jump-to-bottom after scrolling up and scrolls on tap', async () => {
    const { FlatList } = require('react-native');
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const { listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listMessages: jest.Mock;
    };

    listMessages.mockResolvedValue([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'first reply' },
      { role: 'user', content: 'follow up' },
      { role: 'assistant', content: 'second reply at the bottom' },
    ]);

    const { getByTestId, queryByTestId } = await renderChatScreen();

    await waitFor(() => {
      expect(getByTestId('chat-message-list')).toBeTruthy();
    });

    expect(queryByTestId('chat-scroll-to-bottom')).toBeNull();

    fireEvent.scroll(getByTestId('chat-message-list'), {
      nativeEvent: {
        contentOffset: { y: 0, x: 0 },
        contentSize: { height: 2400, width: 400 },
        layoutMeasurement: { height: 400, width: 400 },
      },
    });

    await waitFor(() => {
      expect(getByTestId('chat-scroll-to-bottom')).toBeTruthy();
    });

    scrollToEnd.mockClear();
    fireEvent.press(getByTestId('chat-scroll-to-bottom'));

    await waitFor(() => {
      expect(scrollToEnd).toHaveBeenCalled();
    });

    scrollToEnd.mockRestore();
  });

  it('auto-scrolls while streaming assistant tokens when pinned to bottom', async () => {
    const { FlatList } = require('react-native');
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const { listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listMessages: jest.Mock;
    };
    const { streamSessionChat } = jest.requireMock('../services/hermesGatewayClient') as {
      streamSessionChat: jest.Mock;
    };

    listMessages.mockResolvedValue([]);
    streamSessionChat.mockImplementation(
      async (_url, _sessionId, _text, _key, onEvent, _prompt, onAccepted) => {
        onAccepted?.();
        onEvent({ event: 'assistant.delta', data: { delta: 'Streaming ' } });
        onEvent({ event: 'assistant.delta', data: { delta: 'reply' } });
        onEvent({ event: 'run.completed', data: {} });
        return 'Streaming reply';
      },
    );

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

    const { getByTestId } = await renderChatScreen();

    scrollToEnd.mockClear();

    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), 'scroll during stream');
      fireEvent.press(getByTestId('chat-send-button'));
    });

    await waitFor(() => {
      expect(scrollToEnd).toHaveBeenCalled();
    });

    scrollToEnd.mockRestore();
  });

  it('does not auto-scroll further streaming tokens after the user scrolls up', async () => {
    const { FlatList } = require('react-native');
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const { listMessages } = jest.requireMock('../services/hermesChatClient') as {
      listMessages: jest.Mock;
    };
    const { streamSessionChat } = jest.requireMock('../services/hermesGatewayClient') as {
      streamSessionChat: jest.Mock;
    };

    let emitSecondDelta: (() => void) | undefined;
    listMessages.mockResolvedValue([]);
    streamSessionChat.mockImplementation(
      (_url, _sessionId, _text, _key, onEvent, _prompt, onAccepted) =>
        new Promise((resolve) => {
          onAccepted?.();
          onEvent({ event: 'assistant.delta', data: { delta: 'part one ' } });
          emitSecondDelta = () => {
            onEvent({ event: 'assistant.delta', data: { delta: 'part two' } });
            resolve('part one part two');
          };
        }),
    );

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

    const { getByTestId } = await renderChatScreen();

    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), 'scroll after scroll-up');
      fireEvent.press(getByTestId('chat-send-button'));
    });

    await waitFor(() => {
      expect(getByTestId('chat-message-list')).toBeTruthy();
    });

    await act(async () => {
      fireEvent(getByTestId('chat-message-list'), 'scrollBeginDrag', {
        nativeEvent: {
          contentOffset: { y: 0, x: 0 },
          contentSize: { height: 2400, width: 400 },
          layoutMeasurement: { height: 400, width: 400 },
        },
      });
      fireEvent.scroll(getByTestId('chat-message-list'), {
        nativeEvent: {
          contentOffset: { y: 0, x: 0 },
          contentSize: { height: 2400, width: 400 },
          layoutMeasurement: { height: 400, width: 400 },
        },
      });
      fireEvent(getByTestId('chat-message-list'), 'scrollEndDrag', {
        nativeEvent: {
          contentOffset: { y: 0, x: 0 },
          contentSize: { height: 2400, width: 400 },
          layoutMeasurement: { height: 400, width: 400 },
        },
      });
    });

    await waitFor(() => {
      expect(getByTestId('chat-scroll-to-bottom')).toBeTruthy();
    });

    scrollToEnd.mockClear();

    await act(async () => {
      await flushPendingTimers();
    });

    await act(async () => {
      emitSecondDelta?.();
      await drainChatScreenAsync();
    });

    expect(scrollToEnd).not.toHaveBeenCalled();

    scrollToEnd.mockRestore();
  });
});

describe('resolveEffectiveKeyboardInset', () => {
  const originalOs = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOs;
  });

  it('uses the real keyboard inset when the OS reports one', () => {
    Platform.OS = 'android';
    expect(resolveEffectiveKeyboardInset(310, true, true, 800)).toBe(310);
  });

  it('returns 0 when the keyboard is not on screen even if the input keeps focus', () => {
    // Regression: Android retains TextInput focus after the keyboard is dismissed
    // (back button + blurOnSubmit={false}). Without gating, the composer dock was lifted
    // ~336dp into mid-screen, leaving dead space below it.
    Platform.OS = 'android';
    expect(resolveEffectiveKeyboardInset(0, false, true, 800)).toBe(0);
  });

  it('applies the Android estimate only while the keyboard is genuinely visible', () => {
    Platform.OS = 'android';
    expect(resolveEffectiveKeyboardInset(0, true, true, 800)).toBe(336);
  });

  it('never estimates a lift on iOS', () => {
    Platform.OS = 'ios';
    expect(resolveEffectiveKeyboardInset(0, true, true, 800)).toBe(0);
  });

  it('uses live Android keyboard metrics only while the keyboard is on screen', () => {
    Platform.OS = 'android';
    expect(resolveEffectiveKeyboardInset(0, true, true, 800, 292)).toBe(292);
    expect(resolveEffectiveKeyboardInset(0, false, true, 800, 292)).toBe(0);
  });

  it('still returns 0 after dismiss when metrics, inset, and visibility are all clear', () => {
    Platform.OS = 'android';
    expect(resolveEffectiveKeyboardInset(0, false, true, 800, 0)).toBe(0);
  });
});

describe('shouldClearKeyboardScreenVisible', () => {
  it('defers Android hide while keyboard metrics still report height', () => {
    expect(shouldClearKeyboardScreenVisible('android', 280)).toBe(false);
    expect(shouldClearKeyboardScreenVisible('android', 0)).toBe(true);
  });

  it('clears visibility immediately on iOS hide events', () => {
    expect(shouldClearKeyboardScreenVisible('ios', 280)).toBe(true);
  });
});

describe('shouldIgnoreKeyboardHide', () => {
  it('ignores Android hide only when input remains focused and metrics still show keyboard height', () => {
    expect(shouldIgnoreKeyboardHide('android', 260, true)).toBe(true);
    expect(shouldIgnoreKeyboardHide('android', 0, true)).toBe(false);
    expect(shouldIgnoreKeyboardHide('android', 260, false)).toBe(false);
  });

  it('never ignores iOS hide events', () => {
    expect(shouldIgnoreKeyboardHide('ios', 260, true)).toBe(false);
  });
});
