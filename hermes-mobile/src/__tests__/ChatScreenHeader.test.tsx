import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import ChatScreenHeader, { buildHermesStatusLabel } from '../components/ChatScreenHeader';

describe('ChatScreenHeader', () => {
  it('shows relay only when socket is connected but HTTP is not', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Deploy fix"
        machineLabel="MacBook Pro"
        machineEndpoint="192.168.1.10:8642"
        connectionState="connected"
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toContain('Relay only');
  });

  it('shows endpoint while connected when multi-Mac detail is enabled', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Deploy fix"
        machineLabel="Igors-MacBook-Pro"
        machineEndpoint="10.2.29.103:8642"
        showMachineDetailWhenConnected
        connectionState="disconnected"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-mac').props.children).toBe('Igors-MacBook-Pro');
    expect(getByTestId('chat-context-mac-endpoint').props.children).toContain('10.2.29.103:8642');
    expect(getByTestId('chat-context-link').props.children).toContain('Connected');
  });

  it('shows endpoint when not connected', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Deploy fix"
        machineLabel="MacBook Pro"
        machineEndpoint="192.168.1.10:8642"
        connectionState="disconnected"
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-mac-endpoint').props.children).toBeTruthy();
  });

  it('uses the route status label for disconnected relay-style routes', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="New chat"
        machineLabel="Hermes account relay"
        machineEndpoint="pair once"
        routeStatusLabel="Pair relay in Settings for Wi‑Fi, cellular, or USB"
        connectionState="disconnected"
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toContain(
      'Pair relay in Settings for Wi‑Fi, cellular, or USB',
    );
  });

  it('shows connected when HTTP reachable but socket not live', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="New chat"
        machineLabel="Mac mini"
        machineEndpoint="192.168.1.42:8642"
        connectionState="disconnected"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toContain('Connected');
  });

  it('shows connected when HTTP reachable but socket still connecting', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="New chat"
        machineLabel="Mac mini"
        machineEndpoint="192.168.1.42:8642"
        connectionState="connecting"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toContain('Connected');
  });

  it('opens threads from title press', () => {
    const onThreads = jest.fn();
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="New chat"
        machineLabel="Mac mini"
        connectionState="demo"
        onOpenThreads={onThreads}
        onPressMachine={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('open-sessions-modal'));
    expect(onThreads).toHaveBeenCalled();
  });

  it('renames from title press when handler provided', () => {
    const onRename = jest.fn();
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Skool project"
        machineLabel="Mac mini"
        connectionState="connected"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressThreadTitle={onRename}
        onPressMachine={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('chat-thread-title'));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('renames from pencil without double-firing title press', () => {
    const onRename = jest.fn();
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Skool project"
        machineLabel="Mac mini"
        connectionState="connected"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressThreadTitle={onRename}
        onPressMachine={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('rename-current-thread-header-btn'));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('shows created timestamp under thread title', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Print money make money faster"
        threadCreatedLabel="Jul 2, 2026, 6:53 PM"
        machineLabel="Mac mini"
        connectionState="connected"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-thread-created').props.children).toBe('Jul 2, 2026, 6:53 PM');
  });

  it('keeps long thread titles to one ellipsized header line', () => {
    const longTitle = 'we are working on skool_top_level_integration_branch';
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle={longTitle}
        machineLabel="Mac mini"
        connectionState="connected"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressThreadTitle={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    const title = getByTestId('HERMES CHAT');
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.ellipsizeMode).toBe('tail');
    expect(title.props.children).toBe(longTitle);
    expect(title.props.style).toEqual(
      expect.objectContaining({
        lineHeight: 22,
        letterSpacing: 0,
      }),
    );
  });

  it('shows Hermes model from gateway fallback when session has no model yet', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Session"
        machineLabel="MacBook Pro"
        connectionState="connected"
        macHttpReachable
        activeAgents={[{ name: 'Hermes', status: 'active' }]}
        gatewayModel="google/gemini-2.5-flash"
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-header-hermes-status').props.children).toContain(
      'Hermes (active) · google/gemini-2.5-flash',
    );
  });

  it('shows live in/out tokens from run progress while a turn is active', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Session"
        machineLabel="MacBook Pro"
        connectionState="connected"
        macHttpReachable
        activeAgents={[{ name: 'Hermes', status: 'active' }]}
        currentSession={{ model: 'qwen3:8b-64k', input_tokens: 1200, output_tokens: 40 }}
        runProgress={{
          phase: 'streaming',
          startedAtMs: Date.now(),
          model: 'qwen3:8b-64k',
          inputTokens: 34000,
          outputTokens: 128,
        }}
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-header-hermes-status').props.children).toBe(
      'Hermes (active) · qwen3:8b-64k · In: 34,000 | Out: 128',
    );
  });
});

describe('buildHermesStatusLabel', () => {
  const hermes = { name: 'Hermes', status: 'active' };

  it('prefers session model over gateway fallback', () => {
    expect(
      buildHermesStatusLabel(
        hermes,
        { model: 'qwen3:8b-64k', input_tokens: 500, output_tokens: 20 },
        'google/gemini-2.5-flash',
      ),
    ).toBe('Hermes (active) · qwen3:8b-64k · 520 tokens');
  });

  it('hides gateway platform labels and falls back to the next source', () => {
    expect(buildHermesStatusLabel(hermes, { model: 'hermes-agent' }, 'google/gemini-2.5-flash')).toBe(
      'Hermes (active) · google/gemini-2.5-flash',
    );
  });
});
