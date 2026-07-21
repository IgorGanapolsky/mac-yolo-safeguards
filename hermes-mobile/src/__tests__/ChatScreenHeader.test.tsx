import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatScreenHeader, { buildHermesStatusLabel } from '../components/ChatScreenHeader';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';

describe('ChatScreenHeader', () => {
  it('shows model strip while Connected with no expand toggle', () => {
    const { getByTestId, queryByTestId } = render(
      <ChatScreenHeader
        threadTitle="Research pain points"
        machineLabel="Igors-MacBook-Pro"
        connectionState="connected"
        macHttpReachable
        currentSession={{ model: 'qwen3.5:9b-hermes', input_tokens: 1200, output_tokens: 40 }}
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );
    expect(getByTestId('chat-header-model-strip').props.children).toContain('Qwen3.5 9B Hermes');
    expect(getByTestId('chat-header-model-strip').props.children).toContain('1,240 tokens');
    expect(queryByTestId('chat-header-details-toggle')).toBeNull();
    expect(queryByTestId('chat-header-details-chevron')).toBeNull();
  });

  it('warns when a weak local coding model is active', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Deploy fix"
        machineLabel="MacBook Pro"
        connectionState="connected"
        macHttpReachable
        gatewayModel="qwen3.5:9b-hermes-64k"
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-header-weak-model-warning').props.children).toMatch(/local worker/i);
  });

  it('does not warn on busy but healthy working context (cumulative ~24k)', () => {
    const { queryByTestId } = render(
      <ChatScreenHeader
        threadTitle="Deploy fix"
        machineLabel="MacBook Pro"
        connectionState="connected"
        macHttpReachable
        gatewayModel="glm-coding"
        currentSession={{
          model: 'glm-coding',
          input_tokens: 24_282,
          output_tokens: 173,
          cache_read_tokens: 0,
          api_call_count: 12,
        }}
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(queryByTestId('chat-header-poisoned-context-warning')).toBeNull();
  });

  it('warns when estimated working context is huge', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Deploy fix"
        machineLabel="MacBook Pro"
        connectionState="connected"
        macHttpReachable
        gatewayModel="glm-coding"
        currentSession={{
          model: 'glm-coding',
          input_tokens: 1_200_000,
          output_tokens: 40_000,
          cache_read_tokens: 0,
          api_call_count: 8,
        }}
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-header-poisoned-context-warning').props.children).toMatch(/Start fresh/i);
  });

  it('always shows secondary chrome and transport without a caret toggle', () => {
    const onPressMachine = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ChatScreenHeader
        threadTitle="Deploy fix"
        machineLabel="Igors-Mac-mini"
        machineEndpoint="Tailscale"
        connectionState="connected"
        macHttpReachable
        gatewayModel="qwen3.5:9b-hermes-64k"
        activeAgents={[{ name: 'Hermes', status: 'active' }]}
        onOpenThreads={jest.fn()}
        onPressMachine={onPressMachine}
      />,
    );

    expect(queryByTestId('chat-header-details-toggle')).toBeNull();
    expect(queryByTestId('chat-header-details-chevron')).toBeNull();
    expect(getByTestId('chat-context-link').props.children).toContain('Connected');
    expect(getByTestId('chat-context-mac-endpoint').props.children).toBe('Tailscale');
    expect(getByTestId('chat-header-weak-model-warning').props.children).toMatch(/local worker/i);
    expect(getByTestId('chat-header-hermes-status')).toBeTruthy();
    expect(queryByTestId('chat-header-project-picker')).toBeNull();

    fireEvent.press(getByTestId('chat-context-mac-button'));
    expect(onPressMachine).toHaveBeenCalledTimes(1);
  });

  it('keeps Mac picker on the Connected row', () => {
    const onPressMachine = jest.fn();
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Deploy fix"
        machineLabel="Igors-Mac-mini · Tailscale"
        connectionState="connected"
        macHttpReachable
        gatewayModel="qwen3.5:9b-hermes-64k"
        onOpenThreads={jest.fn()}
        onPressMachine={onPressMachine}
      />,
    );

    fireEvent.press(getByTestId('chat-context-mac-button'));
    expect(onPressMachine).toHaveBeenCalledTimes(1);
    expect(getByTestId('chat-header-weak-model-warning')).toBeTruthy();
  });

  it.each(['Tailscale', 'USB', 'Home Wi-Fi'])(
    'keeps the resolved %s transport in the Connected header',
    (transport) => {
      const { getByTestId } = render(
        <ChatScreenHeader
          threadTitle="Deploy fix"
          machineLabel="Mac"
          machineEndpoint={transport}
          connectionState="connected"
          macHttpReachable
          gatewayModel="qwen3.5:9b-hermes-64k"
          onOpenThreads={jest.fn()}
          onPressMachine={jest.fn()}
        />,
      );

      expect(getByTestId('chat-context-link').props.children).toBe('Connected');
      expect(getByTestId('chat-context-mac-endpoint').props.children).toBe(transport);
    },
  );

  it('keeps wrong-key state out of Connected transport status', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Deploy fix"
        machineLabel="Mac"
        machineEndpoint="Tailscale"
        connectionState="connected"
        macHttpReachable
        authMismatch
        gatewayModel="qwen3.5:9b-hermes-64k"
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toBe(GATEWAY_AUTH_REPAIR_HEADER);
    expect(getByTestId('chat-context-link').props.children).not.toContain('Connected');
    expect(getByTestId('chat-context-mac-endpoint').props.children).toBe('Tailscale');
  });

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

    expect(getByTestId('chat-context-link').props.children).toContain('No computer link');
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
    expect(getByTestId('chat-context-mac-endpoint').props.children).toBe('10.2.29.103:8642');
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
        machineLabel="Hermes Relay"
        machineEndpoint="pair once"
        routeStatusLabel="Pair Hermes Relay in Settings"
        connectionState="disconnected"
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toContain(
      'Pair Hermes Relay in Settings',
    );
  });

  it('needsPair overrides Connecting so Tailscale URL is not a false live path', () => {
    const { getByTestId, queryByTestId } = render(
      <ChatScreenHeader
        threadTitle="New chat"
        machineLabel="Igors-MacBook-Pro"
        machineEndpoint={undefined}
        routeStatusLabel="Pair Hermes Relay in Settings"
        connectionState="connecting"
        needsPair
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toContain(
      'Pair Hermes Relay in Settings',
    );
    expect(String(getByTestId('chat-context-link').props.children)).not.toContain('Connecting');
    expect(queryByTestId('chat-context-mac-endpoint')).toBeNull();
  });

  it('SHIP BLOCK: never green Connected when wrong-key banner is active (even if macHttpReachable)', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="New chat"
        machineLabel="Igors-MacBook-Pro"
        machineEndpoint="127.0.0.1:8642"
        connectionState="disconnected"
        macHttpReachable
        wrongKeyBannerActive
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );
    const label = String(getByTestId('chat-context-link').props.children);
    expect(label).toBe(GATEWAY_AUTH_REPAIR_HEADER);
    expect(label).not.toMatch(/^Connected/);
  });

  it('shows auth repair header instead of Connected when auth mismatches', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Deploy fix"
        machineLabel="Igors-Mac-mini"
        machineEndpoint="100.94.135.78:8642"
        connectionState="connected"
        macHttpReachable={false}
        authMismatch
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toContain(GATEWAY_AUTH_REPAIR_HEADER);
    expect(getByTestId('chat-context-link').props.children).not.toContain('Connected');
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

  it('shows amber stalled copy when chat failed but Mac health is ok', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Print money make money faster"
        machineLabel="Igors-Mac-mini"
        machineEndpoint="100.94.135.78:8642"
        connectionState="connected"
        macHttpReachable
        chatStalled
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toContain('Connected — chat stalled');
    expect(getByTestId('chat-context-link').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: expect.any(String) })]),
    );
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

  it('never renders a header Project lane control (composer chip owns that)', () => {
    const { queryByTestId, queryByText } = render(
      <ChatScreenHeader
        threadTitle="New chat"
        machineLabel="Igors-Mac-mini"
        connectionState="connected"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(queryByTestId('chat-header-project-picker')).toBeNull();
    expect(queryByTestId('chat-context-project')).toBeNull();
    expect(queryByText(/Project lane/)).toBeNull();
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

  it('expands long thread title on title tap', () => {
    const longTitle = 'Choosing the Right Body of Water for Your Next Adventure';
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle={longTitle}
        machineLabel="Mac mini"
        connectionState="connected"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    const title = getByTestId('HERMES CHAT');
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.accessibilityLabel).toBe(longTitle);

    fireEvent.press(getByTestId('chat-thread-title-expand'));
    expect(getByTestId('HERMES CHAT').props.numberOfLines).toBe(6);
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

  it('keeps long thread titles to one ellipsized header line when collapsed', () => {
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
    expect(title.props.accessibilityLabel).toBe(longTitle);
    expect(title.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineHeight: 22,
          letterSpacing: 0,
        }),
      ]),
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

  it('falls back to gatewayModel when an idle session only reports the platform label', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Session"
        machineLabel="MacBook Pro"
        connectionState="connected"
        macHttpReachable
        activeAgents={[{ name: 'Hermes', status: 'active' }]}
        currentSession={{ model: 'hermes-agent', input_tokens: 800, output_tokens: 200 }}
        gatewayModel="qwen3:8b-64k"
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    const label = getByTestId('chat-header-hermes-status').props.children;
    expect(label).toContain('qwen3:8b-64k');
    expect(label).not.toContain('hermes-agent');
    expect(label).toBe('Hermes (active) · qwen3:8b-64k · 1,000 tokens');
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

describe('ChatScreenHeader avatar presence', () => {
  it('does not expose a character avatar in the connection row', () => {
    const { queryByTestId } = render(
      <ChatScreenHeader
        threadTitle="New chat"
        machineLabel="Igors-Mac-mini"
        connectionState="connected"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(queryByTestId('chat-header-avatar')).toBeNull();
  });
});
