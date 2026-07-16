import type { HermesMessage } from '../types/chat';
import { isSummarizationStub } from './chatCompactionHandoff';
import { isMessageBodyEmpty } from './chatMessageMerge';
import { isDeferredStreamPlaceholder } from './streamAssistantText';

/** Poll gateway transcript after empty stream / dropped SSE until reply lands. */
export const DEFERRED_REPLY_POLL_MS = 4_000;
/** Base max wait when no tool activity is seen before surfacing slow-reply copy. */
export const DEFERRED_REPLY_POLL_MAX_MS = 60_000;
/** Longer wait while the Mac is clearly still using tools after the last user turn. */
export const DEFERRED_REPLY_POLL_MAX_WITH_TOOLS_MS = 180_000;
/** After this, status copy switches to "Checking your Mac… (Ns)" while auto-poll continues. */
export const EMPTY_STREAM_SELF_HEAL_AFTER_MS = 30_000;

export const EMPTY_REPLY_FAILURE_REASON =
  'Still no reply text — your Mac may be stuck in tools. Hermes keeps checking automatically; Stop if a run is active, or start a fresh chat.';

/** User-facing status while auto-polling after send with no reply yet. */
export function emptyStreamCheckingStatus(elapsedMs: number): string {
  const elapsedSec = Math.max(1, Math.floor(elapsedMs / 1000));
  if (elapsedMs < EMPTY_STREAM_SELF_HEAL_AFTER_MS) {
    return 'Working on your computer… Hermes may be using tools. The reply will show here when ready.';
  }
  return `Checking your Mac… (${elapsedSec}s)`;
}

/** Keep HTTP polling alive while a user turn is still waiting for assistant text. */
export function shouldKeepAutoPollingForReply(input: {
  awaitingGatewayReply: boolean;
  hasEmptyStreamTimeout: boolean;
}): boolean {
  return input.awaitingGatewayReply || input.hasEmptyStreamTimeout;
}

export function shouldAwaitGatewayReplyAfterSend(options: {
  assistantText: string;
  streamAccepted: boolean;
  streamFailed: boolean;
}): boolean {
  if (!options.streamAccepted) {
    return false;
  }
  // Compaction / "Earlier conversation summarized…" stubs are not real replies.
  if (isSummarizationStub(options.assistantText)) {
    return true;
  }
  if (options.assistantText.trim()) {
    return false;
  }
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
    if (isSummarizationStub(message.content)) {
      continue;
    }
    return true;
  }
  return false;
}

/** Tool names / roles after the last user message — proves the Mac is still working. */
export function toolActivityAfterLastUser(messages: HermesMessage[]): {
  active: boolean;
  labels: string[];
  detail: string;
} {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role?.toLowerCase() === 'user') {
      lastUserIndex = index;
      break;
    }
  }
  const labels: string[] = [];
  for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const role = message.role?.toLowerCase() ?? '';
    if (role === 'tool' || role === 'function') {
      const name =
        (message as { tool_name?: string; name?: string }).tool_name ||
        (message as { name?: string }).name ||
        'tool';
      const short = String(name).replace(/^browser_/, 'browser ').replace(/_/g, ' ');
      if (short && !labels.includes(short)) {
        labels.push(short);
      }
      continue;
    }
    if (role === 'assistant') {
      const raw = message as { tool_calls?: unknown; toolCalls?: unknown };
      if (raw.tool_calls || raw.toolCalls) {
        if (!labels.includes('tools')) {
          labels.push('tools');
        }
      }
    }
  }
  const active = labels.length > 0;
  const shown = labels.slice(0, 3).join(', ');
  const detail = active
    ? `Using on your computer: ${shown}${labels.length > 3 ? '…' : ''}`
    : 'Your computer is still working — waiting for reply text…';
  return { active, labels, detail };
}

export function deferredReplyPollBudgetMs(options: { toolsActive: boolean }): number {
  return options.toolsActive ? DEFERRED_REPLY_POLL_MAX_WITH_TOOLS_MS : DEFERRED_REPLY_POLL_MAX_MS;
}
