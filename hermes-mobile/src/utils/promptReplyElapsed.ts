import type { HermesMessage } from '../types/chat';
import { isSummarizationStub } from './chatCompactionHandoff';
import { isMessageBodyEmpty } from './chatMessageMerge';
import { messageIsEmptyStreamTimeout } from './emptyStreamRefreshCta';
import { parseGatewayTimestamp } from './sessionDisplay';
import { isDeferredStreamPlaceholder } from './streamAssistantText';

export function messageSentAtMs(
  message: Pick<HermesMessage, 'created_at' | 'timestamp'>,
): number | null {
  for (const candidate of [message.created_at, message.timestamp]) {
    if (candidate == null) {
      continue;
    }
    const date = parseGatewayTimestamp(candidate);
    if (date) {
      return date.getTime();
    }
  }
  return null;
}

function indexOfLastUserMessage(messages: readonly HermesMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role?.toLowerCase() === 'user') {
      return index;
    }
  }
  return -1;
}

function isNonSubstantiveAssistantReply(message: HermesMessage): boolean {
  if (message.role?.toLowerCase() !== 'assistant') {
    return true;
  }
  if (isMessageBodyEmpty(message.content, message.rawContent)) {
    return true;
  }
  if (isDeferredStreamPlaceholder(message.content)) {
    return true;
  }
  if (messageIsEmptyStreamTimeout(message.content)) {
    return true;
  }
  if (isSummarizationStub(message.content ?? '')) {
    return true;
  }
  return false;
}

function findSubstantiveAssistantReplyAfter(
  messages: readonly HermesMessage[],
  userIndex: number,
): HermesMessage | undefined {
  for (let index = userIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || message.role?.toLowerCase() !== 'assistant') {
      continue;
    }
    if (isNonSubstantiveAssistantReply(message)) {
      continue;
    }
    return message;
  }
  return undefined;
}

export type PromptReplyElapsedState =
  | { mode: 'live'; sinceMs: number }
  | { mode: 'frozen'; durationSec: number }
  | { mode: 'hidden' };

/** Absolute live-wait fail — Connected+Waiting must not tick for hours. */
export const PROMPT_REPLY_HARD_TIMEOUT_MS = 2 * 60_000;

export function shouldHardTimeoutLivePromptWait(
  sinceMs: number,
  nowMs = Date.now(),
): boolean {
  return nowMs - sinceMs >= PROMPT_REPLY_HARD_TIMEOUT_MS;
}

export function msUntilLivePromptHardTimeout(
  sinceMs: number,
  nowMs = Date.now(),
): number {
  return Math.max(0, PROMPT_REPLY_HARD_TIMEOUT_MS - (nowMs - sinceMs));
}

export function resolvePromptReplyElapsedState(input: {
  messages: readonly HermesMessage[];
  userIndex: number;
}): PromptReplyElapsedState {
  const { messages, userIndex } = input;
  const userMessage = messages[userIndex];
  if (!userMessage || userMessage.role?.toLowerCase() !== 'user') {
    return { mode: 'hidden' };
  }

  const sinceMs = messageSentAtMs(userMessage);
  if (sinceMs == null) {
    return { mode: 'hidden' };
  }

  const reply = findSubstantiveAssistantReplyAfter(messages, userIndex);
  if (reply) {
    const replyMs = messageSentAtMs(reply);
    if (replyMs != null && replyMs >= sinceMs) {
      return {
        mode: 'frozen',
        durationSec: Math.max(0, Math.floor((replyMs - sinceMs) / 1000)),
      };
    }
    return { mode: 'hidden' };
  }

  if (userIndex !== indexOfLastUserMessage(messages)) {
    return { mode: 'hidden' };
  }

  return { mode: 'live', sinceMs };
}

export function resolveLastUserPromptSentAtMs(messages: readonly HermesMessage[]): number | null {
  const lastUserIndex = indexOfLastUserMessage(messages);
  if (lastUserIndex < 0) {
    return null;
  }
  return messageSentAtMs(messages[lastUserIndex]!);
}
