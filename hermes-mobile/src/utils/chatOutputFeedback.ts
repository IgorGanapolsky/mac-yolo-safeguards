import type { HermesMessage } from '../types/chat';
import type { GatewaySettings } from '../types/gateway';
import { isMessageBodyEmpty } from './chatMessageMerge';
import { isLeashProEnabled } from './leashPro';

export function shouldShowChatOutputFeedback(
  message: HermesMessage,
  options: {
    isStreamingAssistant: boolean;
    settings: GatewaySettings;
  },
): boolean {
  if (!isLeashProEnabled(options.settings)) {
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
  return true;
}

export function resolveChatOutputFeedbackBusyKey(message: HermesMessage): string {
  return (
    message.id?.trim() ||
    message.created_at?.trim() ||
    `${message.role}-${message.content.slice(0, 48)}`
  );
}
