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
});
