import type { HermesMessage } from '../types/chat';
import { isMessageBodyEmpty } from './chatMessageMerge';
import {
  EMPTY_REPLY_FAILURE_REASON,
  serverHasAssistantReplyAfterLastUser,
} from './emptyStreamReplyRecovery';
import { isDeferredStreamPlaceholder } from './streamAssistantText';

const TOOL_ROLES = new Set(['tool', 'function', 'tool_result']);

/**
 * Grace after the gateway transcript shows a tool result (no assistant follow-up)
 * before mobile treats the turn as failed. Shorter than the full deferred poll cap
 * so users are not stuck on "Delivering" when the Mac gateway already ended the run.
 */
export const TOOL_RESULT_TERMINAL_GRACE_MS = 90_000;

export const TOOL_RESULT_TERMINAL_FAILURE_REASON =
  'Your computer ran tools but did not send a final reply — tap to try again.';

/** True when the latest turn ends on a tool message with no real assistant reply. */
export function transcriptEndsOnToolResultAfterLastUser(messages: HermesMessage[]): boolean {
  if (serverHasAssistantReplyAfterLastUser(messages)) {
    return false;
  }

  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role?.toLowerCase() === 'user') {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) {
    return false;
  }

  for (let index = messages.length - 1; index > lastUserIndex; index -= 1) {
    const message = messages[index];
    const role = message?.role?.toLowerCase() ?? '';
    if (TOOL_ROLES.has(role)) {
      return true;
    }
    if (role === 'assistant') {
      if (
        isMessageBodyEmpty(message.content, message.rawContent) ||
        isDeferredStreamPlaceholder(message.content)
      ) {
        continue;
      }
      return false;
    }
  }
  return false;
}

export function lastToolResultTimestampMs(messages: HermesMessage[]): number | null {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role?.toLowerCase() === 'user') {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) {
    return null;
  }

  for (let index = messages.length - 1; index > lastUserIndex; index -= 1) {
    const message = messages[index];
    const role = message?.role?.toLowerCase() ?? '';
    if (!TOOL_ROLES.has(role)) {
      continue;
    }
    const created = Date.parse(message.created_at ?? '');
    if (Number.isFinite(created)) {
      return created;
    }
  }
  return null;
}

export function resolveDeferredReplyFailureReason(messages: HermesMessage[]): string {
  return transcriptEndsOnToolResultAfterLastUser(messages)
    ? TOOL_RESULT_TERMINAL_FAILURE_REASON
    : EMPTY_REPLY_FAILURE_REASON;
}

/** Fail deferred reply polling once tool-result terminal state is stable long enough. */
export function shouldFailAwaitingToolResultReply(
  messages: HermesMessage[],
  pollStartedAtMs: number,
  nowMs = Date.now(),
): boolean {
  if (!transcriptEndsOnToolResultAfterLastUser(messages)) {
    return false;
  }
  const toolAt = lastToolResultTimestampMs(messages);
  if (toolAt != null && nowMs - toolAt >= TOOL_RESULT_TERMINAL_GRACE_MS) {
    return true;
  }
  return nowMs - pollStartedAtMs >= TOOL_RESULT_TERMINAL_GRACE_MS;
}

/** Gateway run completed but transcript never got assistant text after tools. */
export function shouldTreatCompletedRunAsToolResultTerminal(messages: HermesMessage[]): boolean {
  return transcriptEndsOnToolResultAfterLastUser(messages);
}
