export type RecentChatsPanelInput = {
  macChatLive: boolean;
  showMacConnectionHelp: boolean;
  visibleSessionCount: number;
  showChatEmptyState: boolean;
  isLoadingMessages: boolean;
  messageCount: number;
  hasAssistantReply: boolean;
  /** User tapped New chat — hide recent list until they pick a thread again. */
  recentChatsDismissed?: boolean;
};

/** Recent chats fill empty threads and sparse threads (no assistant reply yet). */
export function shouldShowRecentChatsPanel(input: RecentChatsPanelInput): boolean {
  if (input.recentChatsDismissed) {
    return false;
  }
  if (!input.macChatLive || input.showMacConnectionHelp || input.visibleSessionCount === 0) {
    return false;
  }
  if (input.showChatEmptyState) {
    return true;
  }
  if (input.isLoadingMessages || input.hasAssistantReply) {
    return false;
  }
  return input.messageCount <= 1;
}

export function hasAssistantReplyInMessages(
  messages: ReadonlyArray<{ role?: string | null }>,
): boolean {
  return messages.some((message) => message.role === 'assistant');
}
