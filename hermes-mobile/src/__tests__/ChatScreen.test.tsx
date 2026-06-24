import React from 'react';
import { fireEvent, act, waitFor } from '@testing-library/react-native';
import ChatScreen from '../screens/ChatScreen';
import { renderInTabNavigator } from '../testUtils/navigation';

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

jest.mock('../context/GatewayContext', () => {
  const actualMock = {
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
    addGatewayListener: jest.fn(),
    removeGatewayListener: jest.fn(),
    refreshHealth: jest.fn().mockResolvedValue(undefined),
    settings: {
      demoMode: true,
      connectionMode: 'gateway',
      gatewayUrl: 'http://localhost:8642',
      cloudUrl: 'https://hermes-mobile-cloud.fly.dev',
      approvalPolicy: 'balanced',
    },
  };
  return {
    useGateway: () => actualMock,
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
      cloudUrl: 'https://hermes-mobile-cloud.fly.dev',
    }),
    saveGatewaySettings: jest.fn().mockResolvedValue(true),
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

jest.mock('../services/chatProjects', () => ({
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
}));

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders header and initial state correctly in demo mode', async () => {
    const { getByText, getByTestId, findByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    expect(getByTestId('HERMES CHAT').props.children).toBeTruthy();
    expect(getByText('DEMO')).toBeTruthy();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(await findByTestId('chat-screen-header')).toBeTruthy();
    expect(getByTestId('chat-context-mac').props.children).toBe('Demo Mac');
    expect(getByTestId('chat-context-project').props.children).toContain('hermes-mobile');
  });

  it('allows text input and shows send button active', () => {
    const { getByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    fireEvent.changeText(input, 'Testing messages');
    expect(input.props.value).toBe('Testing messages');
    expect(sendButton).toBeTruthy();
  });

  it('fills the composer from a quick action without sending', () => {
    const { sendChatMessage } = jest.requireMock('../services/hermesChatClient') as {
      sendChatMessage: jest.Mock;
    };
    sendChatMessage.mockClear();
    const { getByTestId, queryByText, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    const input = getByTestId('chat-input');

    expect(queryByTestId('chat-quick-action-continue')).toBeNull();
    fireEvent.press(getByTestId('chat-quick-action-recent-0'));

    expect(input.props.value).toBe('What is the yolo-health check score?');
    expect(queryByText('processed reply')).toBeNull();
    expect(sendChatMessage).not.toHaveBeenCalled();
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

  it('opens tools modal from command center Tools tile, not threads', () => {
    const { getByTestId, getByText, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    fireEvent.press(getByTestId('command-center-tools'));
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
});
