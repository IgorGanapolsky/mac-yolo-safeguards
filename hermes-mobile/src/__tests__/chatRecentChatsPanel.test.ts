import {
  hasAssistantReplyInMessages,
  hasUserMessageInTranscript,
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

  it('hides once the user has sent into the current thread', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        messageCount: 1,
        hasUserMessage: true,
      }),
    ).toBe(false);
  });

  it('hides while outbound send is in flight', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        showChatEmptyState: false,
        isSending: true,
      }),
    ).toBe(false);
  });

  it('hides while pinned outbound text is visible', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        pinnedOutboundText: 'ship hermes mobile fix',
      }),
    ).toBe(false);
  });

  it('hides while Hermes is still working on the computer', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        hasActiveRun: true,
      }),
    ).toBe(false);
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

  it('hides while history is loading in a non-empty state', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        messageCount: 1,
        isLoadingMessages: true,
      }),
    ).toBe(false);
  });

  it('hides Recents on empty landing while a tapped thread is loading', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        showChatEmptyState: true,
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

  it('does not show recents inline after send when chat is no longer empty', () => {
    expect(
      shouldShowRecentChatsPanel({
        ...base,
        showChatEmptyState: false,
        messageCount: 1,
        hasUserMessage: true,
        hasAssistantReply: false,
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

describe('hasUserMessageInTranscript', () => {
  it('detects non-empty user bubbles', () => {
    expect(
      hasUserMessageInTranscript([{ role: 'user', content: 'hello' }]),
    ).toBe(true);
    expect(hasUserMessageInTranscript([{ role: 'user', content: '   ' }])).toBe(false);
  });
});
