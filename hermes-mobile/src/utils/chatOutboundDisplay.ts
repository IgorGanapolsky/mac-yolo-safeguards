import type { HermesMessage } from '../types/chat';
import { shouldHideToolDumpFromTimeline, dedupeToolDumpMessages } from './chatToolDump';
import { isMessageDisplayEmpty, normalizeMessageText } from './chatMessageMerge';

/** Visual-top clearance for inverted FlatList (maps to paddingBottom). */
export const CHAT_LIST_HEADER_CLEARANCE = 16;

export type SubmittedPromptStripInput = {
  pinnedText: string | null | undefined;
  messages: HermesMessage[];
};

/**
 * Composer "You sent" strip covers the gap before commitOutboundUserBubble lands
 * in the transcript. Once the optimistic user bubble is visible, hide the strip.
 */
export function shouldShowSubmittedPromptStrip(input: SubmittedPromptStripInput): boolean {
  const trimmed = input.pinnedText?.trim();
  if (!trimmed) {
    return false;
  }
  const norm = normalizeMessageText(trimmed);
  const hasOptimisticBubble = input.messages.some(
    (message) =>
      message.role === 'user' &&
      !isMessageDisplayEmpty(message.content) &&
      normalizeMessageText(message.content || '') === norm,
  );
  return !hasOptimisticBubble;
}

export type ChatTimelineEntry = {
  message: HermesMessage;
  originalIndex: number;
};

export type ChatTimelineFilterInput = {
  messages: HermesMessage[];
  includeToolActivity?: boolean;
};

/** FlashList data — hide tool spam; user bubbles always stay in the transcript. */
export function filterChatTimelineMessages(input: ChatTimelineFilterInput): ChatTimelineEntry[] {
  const includeTools = input.includeToolActivity ?? false;
  const timeline: ChatTimelineEntry[] = [];
  input.messages.forEach((message, originalIndex) => {
    if (shouldHideToolDumpFromTimeline(message, includeTools)) {
      return;
    }
    timeline.push({ message, originalIndex });
  });
  const dedupedMessages = dedupeToolDumpMessages(timeline.map((entry) => entry.message));
  const messageToOriginalIndex = new Map<HermesMessage, number>();
  timeline.forEach(({ message, originalIndex }) => {
    if (!messageToOriginalIndex.has(message)) {
      messageToOriginalIndex.set(message, originalIndex);
    }
  });
  return dedupedMessages.map((message) => ({
    message,
    originalIndex: messageToOriginalIndex.get(message) ?? 0,
  }));
}
