import {
  hasAssistantReplyInMessages,
  shouldShowRecentChatsPanel,
} from '../utils/chatRecentChatsPanel';

const base = {
  macChatLive: true,
  showMacConnectionHelp: false,
  visibleSessionCount: 3,
  showChatEmptyState: false,
  isLoadingMessages: false,
  messageCount: 0,
  hasAssistantReply: false,
};

describe('shouldShowRecentChatsPanel', () => {
  it('shows on fully empty chat state', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        showChatEmptyState: true,
      }),
    ).toBe(true);
  });

  it('shows when a thread has one user message and no assistant reply', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        messageCount: 1,
      }),
    ).toBe(true);
  });

  it('hides once an assistant reply exists', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        messageCount: 2,
        hasAssistantReply: true,
      }),
    ).toBe(false);
  });

  it('hides while history is loading', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        showChatEmptyState: true,
        isLoadingMessages: true,
      }),
    ).toBe(true);
  });

  it('hides sparse panel while loading messages in a non-empty state', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        messageCount: 1,
        isLoadingMessages: true,
      }),
    ).toBe(false);
  });

  it('shows recents during heal when chat is empty but sessions exist', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        macChatLive: false,
        showChatEmptyState: true,
      }),
    ).toBe(true);
  });

  it('hides when Mac is unreachable or there are no sessions', () => {
    expect(shouldShowRecentChatsPanel({ ...base, macChatLive: false, showChatEmptyState: false })).toBe(false);
    expect(shouldShowRecentChatsPanel({ ...base, showMacConnectionHelp: true })).toBe(false);
    expect(shouldShowRecentChatsPanel({ ...base, visibleSessionCount: 0 })).toBe(false);
  });

  it('hides after user starts a new chat from the recent list', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        showChatEmptyState: true,
        recentChatsDismissed: true,
      }),
    ).toBe(false);
  });
});

describe('hasAssistantReplyInMessages', () => {
  it('detects assistant role', () => {
    expect(
      hasAssistantReplyInMessages([{ role: 'user' }, { role: 'assistant' }]),
    ).toBe(true);
  });
});
