import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import ChatScreenHeader from '../components/ChatScreenHeader';

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

  it('uses tail ellipsis for long thread titles', () => {
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

    expect(getByTestId('HERMES CHAT').props.ellipsizeMode).toBe('tail');
    expect(getByTestId('HERMES CHAT').props.children).toBe(longTitle);
  });
});
