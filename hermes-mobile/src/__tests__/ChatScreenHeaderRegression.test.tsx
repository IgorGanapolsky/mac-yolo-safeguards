import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatScreenHeader from '../components/ChatScreenHeader';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';

const chatScreenSource = fs.readFileSync(
  path.resolve(__dirname, '../screens/ChatScreen.tsx'),
  'utf8',
);

describe('live chat header regression contract', () => {
  it('keeps the tested header mounted with the connection truth inputs', () => {
    expect(chatScreenSource).toMatch(
      /import ChatScreenHeader from ['"]\.\.\/components\/ChatScreenHeader['"]/,
    );
    expect(chatScreenSource).toMatch(/<ChatScreenHeader[\s\S]*?\/>/);

    for (const prop of [
      'threadCreatedLabel',
      'machineLabel',
      'connectionState',
      'macHttpReachable',
      'authMismatch',
      'wrongKeyBannerActive',
      'needsPair',
      'onPressMachine',
    ]) {
      expect(chatScreenSource).toMatch(new RegExp(`\\b${prop}=`));
    }
  });

  it.each([
    {
      connectionState: 'connected' as const,
      macHttpReachable: true,
      expected: 'Connected',
    },
    {
      connectionState: 'connecting' as const,
      macHttpReachable: false,
      expected: 'Connecting',
    },
    {
      connectionState: 'disconnected' as const,
      macHttpReachable: false,
      expected: 'Not connected',
    },
  ])(
    'shows the exact named Mac and $expected status on the live header',
    ({ connectionState, macHttpReachable, expected }) => {
      const { getByTestId, queryByText } = render(
        <ChatScreenHeader
          threadTitle="Connection regression"
          threadCreatedLabel="Started Jul 26, 2026, 6:53 PM"
          machineLabel="Igors-MacBook-Pro"
          machineEndpoint="Tailscale"
          connectionState={connectionState}
          macHttpReachable={macHttpReachable}
          onOpenThreads={jest.fn()}
          onPressMachine={jest.fn()}
        />,
      );

      expect(getByTestId('chat-context-mac').props.children).toBe('Igors-MacBook-Pro');
      expect(getByTestId('chat-context-link').props.children).toBe(expected);
      expect(getByTestId('chat-thread-created').props.children).toBe(
        'Started Jul 26, 2026, 6:53 PM',
      );
      expect(queryByText(/computer link|scan qr/i)).toBeNull();
    },
  );

  it('never presents an authenticated HTTP mismatch as Connected', () => {
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Connection regression"
        machineLabel="Igors-Mac-mini"
        machineEndpoint="Tailscale"
        connectionState="connected"
        macHttpReachable
        authMismatch
        onOpenThreads={jest.fn()}
        onPressMachine={jest.fn()}
      />,
    );

    expect(getByTestId('chat-context-link').props.children).toBe(
      GATEWAY_AUTH_REPAIR_HEADER,
    );
    expect(getByTestId('chat-context-link').props.children).not.toContain('Connected');
  });

  it('exposes the visible identity and status on the working computer picker', () => {
    const onPressMachine = jest.fn();
    const { getByTestId } = render(
      <ChatScreenHeader
        threadTitle="Connection regression"
        machineLabel="Igors-MacBook-Pro"
        machineEndpoint="Tailscale"
        connectionState="connected"
        macHttpReachable
        onOpenThreads={jest.fn()}
        onPressMachine={onPressMachine}
      />,
    );

    const button = getByTestId('chat-context-mac-button');
    expect(button.props.accessibilityLabel).toBe(
      'Igors-MacBook-Pro. Connected. Tailscale. Choose your computer.',
    );

    fireEvent.press(button);
    expect(onPressMachine).toHaveBeenCalledTimes(1);
  });
});
