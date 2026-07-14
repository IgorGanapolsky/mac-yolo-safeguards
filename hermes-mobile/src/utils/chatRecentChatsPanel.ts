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
  /** Outbound send in flight — never overlay recents on the active prompt. */
  isSending?: boolean;
  pinnedOutboundText?: string | null;
  /** Hermes run still active after delivery (working / streaming). */
  hasActiveRun?: boolean;
  /** Current thread already has a user bubble — recents belong on empty state only. */
  hasUserMessage?: boolean;
};

/** Recent chats fill the empty chat landing only — not the live transcript after send. */
export function shouldShowRecentChatsPanel(input: RecentChatsPanelInput): boolean {
  if (input.recentChatsDismissed) {
    return false;
  }
  // Thread select clears the transcript then hydrates — hide Recents so the spinner is visible.
  if (input.isLoadingMessages) {
    return false;
  }
  if (input.isSending || input.hasActiveRun || input.pinnedOutboundText?.trim()) {
    return false;
  }
  if (input.hasUserMessage) {
    return false;
  }
  if (input.showMacConnectionHelp || input.visibleSessionCount === 0) {
    return false;
  }
  if (!input.macChatLive) {
    return input.showChatEmptyState;
  }
  return input.showChatEmptyState;
}

export function hasAssistantReplyInMessages(
  messages: ReadonlyArray<{ role?: string | null }>,
): boolean {
  return messages.some((message) => message.role === 'assistant');
}

export function hasUserMessageInTranscript(
  messages: ReadonlyArray<{ role?: string | null; content?: string | null }>,
): boolean {
  return messages.some(
    (message) =>
      message.role?.toLowerCase() === 'user' &&
      Boolean(message.content?.trim()),
  );
}
