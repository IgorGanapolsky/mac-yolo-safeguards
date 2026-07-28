import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatContextStrip from '../components/ChatContextStrip';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';

describe('ChatContextStrip', () => {
  it.each([
    {
      connectionState: 'connected' as const,
      macHttpReachable: true,
      expected: 'Connected',
    },
    {
      connectionState: 'connecting' as const,
      macHttpReachable: false,
      expected: 'Connecting…',
    },
    {
      connectionState: 'disconnected' as const,
      macHttpReachable: false,
      expected: 'Not connected',
    },
  ])(
    'shows the exact named Mac and $expected status',
    ({ connectionState, macHttpReachable, expected }) => {
      const { getByTestId, queryByText } = render(
        <ChatContextStrip
          machineLabel="Igors-MacBook-Pro"
          connectionState={connectionState}
          macHttpReachable={macHttpReachable}
        />,
      );

      expect(getByTestId('chat-context-mac').props.children).toBe('Igors-MacBook-Pro');
      expect(getByTestId('chat-context-link').props.children).toBe(expected);
      expect(queryByText(/computer link/i)).toBeNull();
    },
  );

  it('never presents an authenticated HTTP mismatch as Connected', () => {
    const { getByTestId } = render(
      <ChatContextStrip
        machineLabel="Igors-Mac-mini"
        connectionState="connected"
        macHttpReachable
        authMismatch
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toBe(GATEWAY_AUTH_REPAIR_HEADER);
    expect(getByTestId('chat-context-link').props.children).not.toContain('Connected');
  });

  it('exposes named computer and project controls with working callbacks', () => {
    const onPressMac = jest.fn();
    const onPressProject = jest.fn();
    const { getByTestId } = render(
      <ChatContextStrip
        machineLabel="Igors-MacBook-Pro"
        connectionState="connected"
        macHttpReachable
        projectName="Hermes Mobile"
        workspacePath="/workspace/hermes-mobile"
        handoffSummary="Continue the connection regression audit"
        macSwitchHint="Switch to another saved Mac"
        onPressMac={onPressMac}
        onPressProject={onPressProject}
      />,
    );

    const macButton = getByTestId('chat-context-mac-button');
    expect(macButton.props.accessibilityRole).toBe('button');
    expect(macButton.props.accessibilityLabel).toBe(
      'Choose your computer — Igors-MacBook-Pro',
    );
    expect(getByTestId('chat-context-mac-hint').props.children).toBe(
      'Switch to another saved Mac',
    );

    const projectButton = getByTestId('chat-context-project-row');
    expect(projectButton.props.accessibilityRole).toBe('button');
    expect(projectButton.props.accessibilityLabel).toBe('Choose project');
    expect(getByTestId('chat-context-project')).toHaveTextContent(
      'Hermes Mobile · /workspace/hermes-mobile',
    );
    expect(getByTestId('chat-context-handoff')).toHaveTextContent(
      '↪ Continue the connection regression audit',
    );

    fireEvent.press(macButton);
    fireEvent.press(projectButton);
    expect(onPressMac).toHaveBeenCalledTimes(1);
    expect(onPressProject).toHaveBeenCalledTimes(1);
  });

  it('renders truthful defaults without pretending disabled rows are controls', () => {
    const { getByTestId } = render(
      <ChatContextStrip
        machineLabel="Your computer"
        connectionState="disconnected"
      />,
    );

    expect(getByTestId('chat-context-mac-button').props.accessibilityRole).toBeUndefined();
    expect(getByTestId('chat-context-project-row').props.accessibilityRole).toBeUndefined();
    expect(getByTestId('chat-context-project')).toHaveTextContent(
      'No project pinned — Hermes uses the computer default workspace',
    );
  });

  it('uses an explicit channel hint instead of the default project copy', () => {
    const { getByTestId } = render(
      <ChatContextStrip
        machineLabel="Igors-MacBook-Pro"
        connectionState="demo"
        channelHint="Personal workspace"
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toBe('Connected');
    expect(getByTestId('chat-context-project')).toHaveTextContent('Personal workspace');
  });
});
