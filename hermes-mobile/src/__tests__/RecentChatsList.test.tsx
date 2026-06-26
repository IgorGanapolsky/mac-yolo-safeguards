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
});
