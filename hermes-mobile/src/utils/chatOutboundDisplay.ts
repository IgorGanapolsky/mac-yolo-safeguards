import type { HermesMessage } from '../types/chat';
import { shouldHideToolDumpFromTimeline, dedupeToolDumpMessages } from './chatToolDump';
import { isMessageDisplayEmpty, normalizeMessageText } from './chatMessageMerge';
import { isTransientWorkingStatusPlaceholder } from './streamAssistantText';

/** Visual-top clearance for inverted FlatList (maps to paddingBottom). */
export const CHAT_LIST_HEADER_CLEARANCE = 16;

export type SubmittedPromptStripInput = {
  pinnedText: string | null | undefined;
  messages: HermesMessage[];
};

/**
 * Composer "You sent" strip covers the gap before commitOutboundUserBubble lands
 * in the transcript. Once the optimistic user bubble is visible, hide the strip.
 *
 * ChatScreen must use this result ONLY — never `isSending ||` / status overrides.
 * Those overrides duplicated the prompt (bubble + purple strip) while a run was in flight.
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

/**
 * ChatScreen visibility contract. `isSending` is accepted only to prove it must be ignored —
 * matching bubble ⇒ strip stays hidden even while a send is in flight.
 */
export function resolveSubmittedPromptStripVisibility(
  input: SubmittedPromptStripInput & { isSending?: boolean },
): boolean {
  void input.isSending;
  return shouldShowSubmittedPromptStrip(input);
}

export type ChatTimelineEntry = {
  message: HermesMessage;
  originalIndex: number;
};

export type ChatTimelineFilterInput = {
  messages: HermesMessage[];
  includeToolActivity?: boolean;
};

/**
 * Cron runners prepend this delivery-only control block to scheduled runs.
 * It is model instruction scaffolding, never a conversation turn, regardless
 * of the role the gateway assigns while persisting the transcript.
 */
export function isCronSystemDeliveryScaffolding(content: unknown): boolean {
  if (typeof content !== 'string') {
    return false;
  }
  const normalized = content.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  if (
    !/^\[?important\s*:/.test(normalized) ||
    !/\byou are running as a scheduled cron job\b/.test(normalized)
  ) {
    return false;
  }
  const markers = [
    /\bdelivery\s*:\s*(?:your\s+)?final response\b/,
    /\bfinal response (?:will be )?automatically delivered\b/,
    /\bdo not use send_message\b/,
    /\bsilent\s*:\s*/,
  ];
  return markers.filter((marker) => marker.test(normalized)).length >= 2;
}

/** FlashList data — hide tool spam + in-flight working status; user bubbles always stay. */
export function filterChatTimelineMessages(input: ChatTimelineFilterInput): ChatTimelineEntry[] {
  const includeTools = input.includeToolActivity ?? false;
  const timeline: ChatTimelineEntry[] = [];
  input.messages.forEach((message, originalIndex) => {
    if (isCronSystemDeliveryScaffolding(message.content)) {
      return;
    }
    if (shouldHideToolDumpFromTimeline(message, includeTools)) {
      return;
    }
    // Progress lives in RunProgressBanner — never stack working-status bubbles in chat.
    if (
      message.role?.toLowerCase() === 'assistant' &&
      isTransientWorkingStatusPlaceholder(message.content)
    ) {
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
