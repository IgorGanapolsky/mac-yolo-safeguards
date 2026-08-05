import type { HermesMessage } from '../types/chat';
import { isSummarizationStub } from './chatCompactionHandoff';
import { isMessageBodyEmpty } from './chatMessageMerge';
import { isDeferredStreamPlaceholder, isSilentAssistantCompletion } from './streamAssistantText';

/** Poll gateway transcript after empty stream / dropped SSE until reply lands. */
export const DEFERRED_REPLY_POLL_MS = 4_000;
/** Base max wait when no tool activity is seen before surfacing slow-reply copy. */
export const DEFERRED_REPLY_POLL_MAX_MS = 60_000;
/** Longer wait while the Mac is clearly still using tools after the last user turn. */
export const DEFERRED_REPLY_POLL_MAX_WITH_TOOLS_MS = 180_000;
/** After this, status copy switches to "Checking your Mac… (Ns)" while auto-poll continues. */
export const EMPTY_STREAM_SELF_HEAL_AFTER_MS = 30_000;
/**
 * Absolute ceiling for "Checking your Mac…" / deferred poll.
 * Soft timeout (60–180s) already surfaces failure; this hard-stop ends auto-poll
 * so Connected never sits on a 57-minute spinner without an actionable CTA.
 * Must be >= DEFERRED_REPLY_POLL_MAX_WITH_TOOLS_MS.
 */
export const EMPTY_STREAM_HARD_STOP_MS = 4 * 60_000;

export const EMPTY_REPLY_FAILURE_REASON =
  'Still no reply text — the run on your Mac stalled or never produced an answer. Start a fresh chat, or resend. Only open Leash if a tool is actually waiting for approve/deny.';

/** Hard-stop banner/status after EMPTY_STREAM_HARD_STOP_MS with no assistant text. */
export const EMPTY_STREAM_HARD_STOP_STATUS =
  'Stopped waiting on your Mac — no reply text arrived. Start a fresh chat (best), or resend. Open Leash only if a tool is waiting for approve/deny.';

/** User-facing status while auto-polling after send with no reply yet. */
export function emptyStreamCheckingStatus(elapsedMs: number): string {
  if (shouldHardStopEmptyStreamWait(elapsedMs)) {
    return EMPTY_STREAM_HARD_STOP_STATUS;
  }
  const elapsedSec = Math.max(1, Math.floor(elapsedMs / 1000));
  if (elapsedMs < EMPTY_STREAM_SELF_HEAL_AFTER_MS) {
    return 'Working on your computer… Hermes may be using tools. The reply will show here when ready.';
  }
  return `Checking your Mac… (${elapsedSec}s)`;
}

export function shouldHardStopEmptyStreamWait(elapsedMs: number): boolean {
  return elapsedMs >= EMPTY_STREAM_HARD_STOP_MS;
}

/**
 * Keep HTTP polling alive while a user turn is still waiting for assistant text —
 * but never past the hard stop (product law: chat must not block forever).
 */
export function shouldKeepAutoPollingForReply(input: {
  awaitingGatewayReply: boolean;
  hasEmptyStreamTimeout: boolean;
  /** Wall-clock since send / wait start; when past hard stop, always false. */
  waitElapsedMs?: number;
}): boolean {
  if (
    typeof input.waitElapsedMs === 'number' &&
    shouldHardStopEmptyStreamWait(input.waitElapsedMs)
  ) {
    return false;
  }
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
  if (isSilentAssistantCompletion(options.assistantText)) {
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

function isSubstantialAssistantBody(content: string | undefined | null): boolean {
  const text = content ?? undefined;
  if (isMessageBodyEmpty(text)) {
    return false;
  }
  if (isDeferredStreamPlaceholder(text)) {
    return false;
  }
  if (isSummarizationStub(text)) {
    return false;
  }
  if (isSilentAssistantCompletion(text ?? '')) {
    return false;
  }
  return Boolean(text?.trim());
}

/**
 * Tool names / roles after the last user message that still imply the Mac is working.
 *
 * Product law (dogfood 2026-08-05): historical tools BEFORE a finished assistant
 * body must not keep "Using on your computer: tools" forever after a partial or
 * final reply already landed. Only tools (or open tool_calls) after the latest
 * substantial assistant turn count as active.
 */
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
  let lastSubstantialAssistantIndex = -1;
  for (let index = messages.length - 1; index > lastUserIndex; index -= 1) {
    const message = messages[index];
    if (message?.role?.toLowerCase() !== 'assistant') {
      continue;
    }
    if (isSubstantialAssistantBody(message.content)) {
      lastSubstantialAssistantIndex = index;
      break;
    }
  }
  // Scan only after the latest real assistant body (tools still running), else after user.
  const scanFrom =
    lastSubstantialAssistantIndex >= 0 ? lastSubstantialAssistantIndex : lastUserIndex + 1;
  const labels: string[] = [];
  for (let index = scanFrom; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const role = message.role?.toLowerCase() ?? '';
    if (role === 'tool' || role === 'function') {
      // Skip tool rows that are the same index as the assistant (impossible) —
      // and skip tools that only exist before the substantial assistant when
      // scanFrom already jumped past them.
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
      const calls = raw.tool_calls ?? raw.toolCalls;
      if (calls && (Array.isArray(calls) ? calls.length > 0 : true)) {
        // Open tool_calls on the latest assistant = still working.
        if (index >= lastSubstantialAssistantIndex && !labels.includes('tools')) {
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

/**
 * Whether to keep the "Using on your computer: tools" footer / runProgress working chrome.
 * Never past EMPTY_STREAM_HARD_STOP_MS — even when historical tools exist.
 */
export function shouldRetainToolsWorkingChrome(input: {
  activityActive: boolean;
  waitElapsedMs: number;
}): boolean {
  if (!input.activityActive) {
    return false;
  }
  if (shouldHardStopEmptyStreamWait(input.waitElapsedMs)) {
    return false;
  }
  return true;
}

export function deferredReplyPollBudgetMs(options: { toolsActive: boolean }): number {
  return options.toolsActive ? DEFERRED_REPLY_POLL_MAX_WITH_TOOLS_MS : DEFERRED_REPLY_POLL_MAX_MS;
}
