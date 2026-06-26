import type { HermesMessage } from '../types/chat';
import { isMessageDisplayEmpty, normalizeMessageText } from './chatMessageMerge';

/** Visual-top clearance for inverted FlatList (maps to paddingBottom). */
export const CHAT_LIST_HEADER_CLEARANCE = 16;

/**
 * Composer "You sent" strip duplicates the optimistic user bubble once
 * commitOutboundUserBubble adds the message to the transcript list.
 */
export function shouldShowSubmittedPromptStrip(
  pinnedText: string | null | undefined,
  messages: HermesMessage[],
): boolean {
  const trimmed = pinnedText?.trim();
  if (!trimmed) {
    return false;
  }
  const norm = normalizeMessageText(trimmed);
  const hasOptimisticBubble = messages.some(
    (message) =>
      message.role === 'user' &&
      !isMessageDisplayEmpty(message.content) &&
      normalizeMessageText(message.content || '') === norm,
  );
  return !hasOptimisticBubble;
}
