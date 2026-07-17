import type { HermesMessage } from '../types/chat';
import { isMessageBodyEmpty } from './chatMessageMerge';
import { isDeferredStreamPlaceholder } from './streamAssistantText';

export function shouldShowChatOutputFeedback(
  message: HermesMessage,
  options: {
    leashUnlocked: boolean;
    isStreamingAssistant: boolean;
  },
): boolean {
  if (!options.leashUnlocked) {
    return false;
  }
  if (message.role?.toLowerCase() !== 'assistant') {
    return false;
  }
  if (options.isStreamingAssistant) {
    return false;
  }
  if (isMessageBodyEmpty(message.content, message.rawContent)) {
    return false;
  }
  // Status placeholders are not real replies — never offer thumbs.
  if (isDeferredStreamPlaceholder(message.content)) {
    return false;
  }
  return true;
}

export function resolveChatOutputFeedbackBusyKey(message: HermesMessage): string {
  return (
    message.id?.trim() ||
    message.created_at?.trim() ||
    `${message.role}-${message.content.slice(0, 48)}`
  );
}
