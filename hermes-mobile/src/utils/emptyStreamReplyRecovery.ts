import type { HermesMessage } from '../types/chat';
import {
  effectiveAssistantReplyText,
  isCompactionOnlyAssistantText,
} from './chatCompactionHandoff';
import { isMessageBodyEmpty } from './chatMessageMerge';
import { isDeferredStreamPlaceholder } from './streamAssistantText';

/** Poll gateway transcript after empty stream / dropped SSE until reply lands or timeout. */
export const DEFERRED_REPLY_POLL_MS = 3_000;
export const DEFERRED_REPLY_POLL_MAX_MS = 60_000;

export const EMPTY_REPLY_FAILURE_REASON =
  'Your computer finished but no reply text arrived — tap to retry.';

export function shouldAwaitGatewayReplyAfterSend(options: {
  assistantText: string;
  streamAccepted: boolean;
  streamFailed: boolean;
}): boolean {
  if (!options.streamAccepted) {
    return false;
  }
  const effective = effectiveAssistantReplyText(options.assistantText);
  if (effective.trim()) {
    return false;
  }
  // Compaction-only stubs are not answers — keep polling for the real reply.
  return true;
}

export function serverHasAssistantReplyAfterLastUser(serverMessages: HermesMessage[]): boolean {
  let lastUserIndex = -1;
  for (let index = serverMessages.length - 1; index >= 0; index -= 1) {
    if (serverMessages[index]?.role?.toLowerCase() === 'user') {
      lastUserIndex = index;
      break;
    }
  }
  for (let index = lastUserIndex + 1; index < serverMessages.length; index += 1) {
    const message = serverMessages[index];
    if (message?.role?.toLowerCase() !== 'assistant') {
      continue;
    }
    if (isMessageBodyEmpty(message.content, message.rawContent)) {
      continue;
    }
    if (isDeferredStreamPlaceholder(message.content)) {
      continue;
    }
    if (isCompactionOnlyAssistantText(message.content) || isCompactionOnlyAssistantText(message.rawContent)) {
      continue;
    }
    if (!effectiveAssistantReplyText(message.content || message.rawContent).trim()) {
      continue;
    }
    return true;
  }
  return false;
}
