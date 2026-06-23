import React from 'react';
import { fireEvent, act, waitFor } from '@testing-library/react-native';
import ChatScreen from '../screens/ChatScreen';
import { renderInTabNavigator } from '../testUtils/navigation';

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
  bindSessionToProject: jest.fn((state, projectId, sessionId) => state),
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

    expect(getByText('💬 HERMES CHAT')).toBeTruthy();
    expect(getByText('DEMO MODE')).toBeTruthy();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(await findByTestId('chat-context-strip')).toBeTruthy();
    expect(getByTestId('chat-context-mac').props.children).toBe('Demo Mac (127.0.0.1)');
    await waitFor(() => {
      expect(getByTestId('chat-context-project').props.children).not.toBe(
        'No project pinned — Hermes uses the computer default workspace',
      );
    });
  });

  it('allows text input and shows send button active', () => {
    const { getByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    fireEvent.changeText(input, 'Testing messages');
    expect(input.props.value).toBe('Testing messages');
    expect(sendButton.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('triggers mock message sending and progress banner in demo mode', () => {
    const { getByTestId, queryByTestId } = renderInTabNavigator(ChatScreen, 'Chat');
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    fireEvent.changeText(input, 'Hello Hermes');
    fireEvent.press(sendButton);

    expect(getByTestId('run-progress-banner')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1600);
    });

    expect(queryByTestId('run-progress-banner')).toBeNull();
  });

  it('opens and closes sessions selector modal', () => {
    const { getByTestId, getByText, queryByText } = renderInTabNavigator(ChatScreen, 'Chat');

    expect(queryByText('Select Chat Session')).toBeNull();

    fireEvent.press(getByTestId('open-sessions-modal'));
    expect(getByText('Select Chat Session')).toBeTruthy();

    fireEvent.press(getByText('Close'));
    expect(queryByText('Select Chat Session')).toBeNull();
  });

  it('can start a new session from modal', () => {
    const { getByTestId } = renderInTabNavigator(ChatScreen, 'Chat');

    fireEvent.press(getByTestId('open-sessions-modal'));
    const newSessionButton = getByTestId('modal-new-chat-button');
    fireEvent.press(newSessionButton);

    expect(getByTestId('chat-empty-state')).toBeTruthy();
  });
});
