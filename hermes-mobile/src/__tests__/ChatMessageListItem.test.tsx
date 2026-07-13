import React from 'react';
import { render } from '@testing-library/react-native';
import ChatMessageListItem from '../components/ChatMessageListItem';
import type { HermesMessage } from '../types/chat';

describe('ChatMessageListItem empty rows', () => {
  const baseProps = {
    listIndex: 0,
    originalIndex: 0,
    messages: [] as HermesMessage[],
    timeLabel: 'Jul 13, 2026 9:10 AM',
    includeToolActivity: false,
    isTelegramInbox: false,
    connectionState: 'connected' as const,
    macHttpOk: true,
    approvalBusy: false,
    isSending: false,
    onShowDetail: jest.fn(),
    onInlineTextApproval: jest.fn(),
  };

  it('hides empty user timestamp-only rows', () => {
    const { queryByTestId } = render(
      <ChatMessageListItem
        {...baseProps}
        item={{ id: 'user-empty', role: 'user', content: '', created_at: '2026-07-13T13:10:00.000Z' }}
      />,
    );
    expect(queryByTestId('chat-message-user')).toBeNull();
    expect(queryByTestId('chat-message-timestamp')).toBeNull();
  });

  it('still renders non-empty user prompts', () => {
    const { getByTestId, getByText } = render(
      <ChatMessageListItem
        {...baseProps}
        item={{
          id: 'user-ok',
          role: 'user',
          content: 'Make money today',
          created_at: '2026-07-13T13:10:00.000Z',
        }}
      />,
    );
    expect(getByTestId('chat-message-user')).toBeTruthy();
    expect(getByText('Make money today')).toBeTruthy();
  });
});
