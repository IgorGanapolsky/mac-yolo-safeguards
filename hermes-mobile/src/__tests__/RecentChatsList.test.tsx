import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import RecentChatsList from '../components/RecentChatsList';
import type { HermesSession } from '../types/chat';

const sessions: HermesSession[] = [
  { id: 's1', title: 'First thread', last_active_at: '2026-06-23T12:00:00Z' },
  { id: 's2', title: 'Second thread', last_active_at: '2026-06-22T12:00:00Z' },
];

describe('RecentChatsList', () => {
  it('calls onNewChat when New chat is pressed', () => {
    const onNewChat = jest.fn();
    const { getByTestId } = render(
      <RecentChatsList
        sessions={sessions}
        sessionLabelFor={(session) => session.title ?? session.id}
        onSelectSession={jest.fn()}
        onNewChat={onNewChat}
      />,
    );

    fireEvent.press(getByTestId('recent-chats-new-chat'));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('calls onClearAll when Clear all is pressed', () => {
    const onClearAll = jest.fn();
    const { getByTestId } = render(
      <RecentChatsList
        sessions={sessions}
        sessionLabelFor={(session) => session.title ?? session.id}
        onSelectSession={jest.fn()}
        onClearAll={onClearAll}
      />,
    );

    fireEvent.press(getByTestId('recent-chats-clear-all'));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('shows Clear all when rail sessions are empty but Mac still has threads', () => {
    const onClearAll = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <RecentChatsList
        sessions={[]}
        sessionLabelFor={(session) => session.title ?? session.id}
        onSelectSession={jest.fn()}
        onClearAll={onClearAll}
        showActionsWhenEmpty
      />,
    );

    expect(getByTestId('recent-chats-clear-all')).toBeTruthy();
    expect(queryByTestId('recent-chat-s1')).toBeNull();
    fireEvent.press(getByTestId('recent-chats-clear-all'));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('hides the panel when sessions are empty and showActionsWhenEmpty is false', () => {
    const { queryByTestId } = render(
      <RecentChatsList
        sessions={[]}
        sessionLabelFor={(session) => session.title ?? session.id}
        onSelectSession={jest.fn()}
        onClearAll={jest.fn()}
      />,
    );

    expect(queryByTestId('recent-chats-list')).toBeNull();
  });

  it('calls onSelectSession when a recent row is pressed', () => {
    const onSelectSession = jest.fn();
    const { getByTestId } = render(
      <RecentChatsList
        sessions={sessions}
        sessionLabelFor={(session) => session.title ?? session.id}
        onSelectSession={onSelectSession}
      />,
    );

    fireEvent.press(getByTestId('recent-chat-s1'));
    expect(onSelectSession).toHaveBeenCalledTimes(1);
    expect(onSelectSession).toHaveBeenCalledWith(sessions[0]);
  });

  it('calls onRenameSession when rename pencil is pressed', () => {
    const onRenameSession = jest.fn();
    const { getByTestId } = render(
      <RecentChatsList
        sessions={sessions}
        sessionLabelFor={(session) => session.title ?? session.id}
        onSelectSession={jest.fn()}
        onRenameSession={onRenameSession}
      />,
    );

    fireEvent.press(getByTestId('recent-chat-rename-s1'));
    expect(onRenameSession).toHaveBeenCalledWith('s1', 'First thread');
  });

  it('calls onDeleteSession when trash is pressed', () => {
    const onDeleteSession = jest.fn();
    const { getByTestId } = render(
      <RecentChatsList
        sessions={sessions}
        sessionLabelFor={(session) => session.title ?? session.id}
        onSelectSession={jest.fn()}
        onDeleteSession={onDeleteSession}
      />,
    );

    fireEvent.press(getByTestId('recent-chat-delete-s1'));
    expect(onDeleteSession).toHaveBeenCalledWith('s1');
  });

  it('expands a long recent thread title without opening the chat', () => {
    const longTitle =
      'Choosing the Right Body of Water for Your Next Adventure and Fishing Trip';
    const longSessions: HermesSession[] = [
      { id: 's-long', title: longTitle, last_active_at: '2026-06-23T12:00:00Z' },
    ];
    const onSelectSession = jest.fn();
    const { getByTestId } = render(
      <RecentChatsList
        sessions={longSessions}
        sessionLabelFor={(session) => session.title ?? session.id}
        onSelectSession={onSelectSession}
      />,
    );

    const titleText = getByTestId('recent-chat-title-s-long-text');
    expect(titleText.props.numberOfLines).toBe(2);

    fireEvent.press(getByTestId('recent-chat-title-s-long'));
    expect(getByTestId('recent-chat-title-s-long-text').props.numberOfLines).toBe(6);
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it('badges mega sessions over WARN and BLOCK thresholds', () => {
    const megaSessions: HermesSession[] = [
      {
        id: 's-warn',
        title: 'Warn thread',
        last_active_at: '2026-07-13T12:00:00Z',
        input_tokens: 400_000,
      },
      {
        id: 's-block',
        title: 'Block thread',
        last_active_at: '2026-07-13T11:00:00Z',
        input_tokens: 1_700_000,
      },
    ];
    const { getByTestId } = render(
      <RecentChatsList
        sessions={megaSessions}
        sessionLabelFor={(session) => session.title ?? session.id}
        onSelectSession={jest.fn()}
      />,
    );

    expect(getByTestId('recent-chat-mega-badge-s-warn').props.children).toBe('Large');
    expect(getByTestId('recent-chat-mega-badge-s-block').props.children).toBe('Too large');
  });
});
