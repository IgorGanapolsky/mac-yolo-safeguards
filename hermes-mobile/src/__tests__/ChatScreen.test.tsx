import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import ChatScreen from '../screens/ChatScreen';

// Mock GatewayContext
jest.mock('../context/GatewayContext', () => ({
  useGateway: () => ({
    settings: {
      demoMode: true,
      connectionMode: 'gateway',
      gatewayUrl: 'http://localhost:8642',
      cloudUrl: 'https://agentleash-cloud.fly.dev',
    },
    connectionState: 'demo',
    apiKey: 'test-api-key',
  }),
}));

// Mock secure credentials and storage to avoid errors
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
      cloudUrl: 'https://agentleash-cloud.fly.dev',
    }),
    saveGatewaySettings: jest.fn().mockResolvedValue(true),
  },
}));

// Mock haptics
jest.mock('../services/haptics', () => ({
  haptics: {
    light: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    heavy: jest.fn(),
  },
}));

// Mock hermesChatClient
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

  it('renders header and initial state correctly in demo mode', () => {
    const { getByText, getByTestId } = render(<ChatScreen />);
    
    expect(getByText('💬 HERMES CHAT')).toBeTruthy();
    expect(getByText('DEMO MODE')).toBeTruthy();
    expect(getByTestId('chat-input')).toBeTruthy();
  });

  it('allows text input and shows send button active', () => {
    const { getByTestId } = render(<ChatScreen />);
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    fireEvent.changeText(input, 'Testing messages');
    expect(input.props.value).toBe('Testing messages');
    expect(sendButton.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('triggers mock message sending and thinking indicator in demo mode', () => {
    const { getByTestId, queryByTestId, getByText } = render(<ChatScreen />);
    const input = getByTestId('chat-input');
    const sendButton = getByTestId('chat-send-button');

    fireEvent.changeText(input, 'Hello Hermes');
    fireEvent.press(sendButton);

    // Should show thinking indicator in demo mode
    expect(getByTestId('thinking-indicator')).toBeTruthy();
    expect(getByText('Hermes is typing...')).toBeTruthy();

    // Fast forward mock reply delay
    act(() => {
      jest.advanceTimersByTime(1600);
    });

    // Thinking indicator should disappear
    expect(queryByTestId('thinking-indicator')).toBeNull();
  });

  it('opens and closes sessions selector modal', () => {
    const { getByTestId, getByText, queryByText } = render(<ChatScreen />);
    
    // Modal title should not be visible initially
    expect(queryByText('Select Chat Session')).toBeNull();

    // Press selector to open modal
    fireEvent.press(getByTestId('open-sessions-modal'));
    expect(getByText('Select Chat Session')).toBeTruthy();

    // Press close to hide modal
    fireEvent.press(getByText('Close'));
    expect(queryByText('Select Chat Session')).toBeNull();
  });

  it('can start a new session from modal', () => {
    const { getByTestId, getByText } = render(<ChatScreen />);
    
    fireEvent.press(getByTestId('open-sessions-modal'));
    const newSessionButton = getByTestId('modal-new-chat-button');
    fireEvent.press(newSessionButton);

    // Empty state should be visible for new session
    expect(getByTestId('chat-empty-state')).toBeTruthy();
  });
});
