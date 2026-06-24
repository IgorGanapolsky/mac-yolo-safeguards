import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import ChatScreenHeader from '../components/ChatScreenHeader';

describe('ChatScreenHeader', () => {
  it('renders thread title, Mac endpoint, and live status', () => {
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

    expect(getByTestId('HERMES CHAT').props.children).toBe('Deploy fix');
    expect(getByTestId('chat-context-link').props.children).toContain('Live');
    expect(getByTestId('chat-context-mac-endpoint').props.children).toBeTruthy();
  });

  it('shows Mac online when HTTP reachable but socket not live', () => {
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

    expect(getByTestId('chat-context-link').props.children).toContain('Mac online');
  });

  it('shows Mac online when HTTP reachable but socket still connecting', () => {
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

    expect(getByTestId('chat-context-link').props.children).toContain('Mac online');
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
});
