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
  'Still no reply text — your Mac may be stuck or waiting for a Leash approval. Stop the run, open Leash to approve/deny/warn, or start a fresh chat.';

export const EMPTY_STREAM_HARD_STOP_STATUS =
  'Still no live reply text after a long wait. Open Leash if a tool needs approve/deny/warn, Stop an active run, or start a fresh chat.';

/**
 * Zero-token stall class (fresh Play install + Tailscale pair, 2026-08-01):
 * session exists and the user row is on the Mac, but api_call_count / output_tokens
 * stay 0. Transcript polling alone never starts the agent — self-heal forks a
 * fresh session and resends once.
 */
export const ZERO_TOKEN_SELF_HEAL_AFTER_MS = DEFERRED_REPLY_POLL_MAX_MS;
export const ZERO_TOKEN_SELF_HEAL_MAX = 1;
export const ZERO_TOKEN_SELF_HEAL_HINT =
  'No reply from your computer — starting a fresh chat and resending…';

/**
 * After soft empty-stream timeout, auto fork+resend when the Mac link is healthy
 * but the agent never produced tokens (not a connectivity failure).
 */
export function shouldZeroTokenSelfHeal(input: {
  macHttpOk: boolean;
  isDemo?: boolean;
  waitElapsedMs: number;
  /** Inverse of serverHasAssistantReplyAfterLastUser when a user turn exists. */
  hasUserWithoutAssistant: boolean;
  sessionOutputTokens?: number | null;
  sessionApiCallCount?: number | null;
  healsUsed: number;
  maxHeals?: number;
}): boolean {
  if (input.isDemo || !input.macHttpOk) {
    return false;
  }
  if (!input.hasUserWithoutAssistant) {
    return false;
  }
  const maxHeals = input.maxHeals ?? ZERO_TOKEN_SELF_HEAL_MAX;
  if (input.healsUsed >= maxHeals) {
    return false;
  }
  if (input.waitElapsedMs < ZERO_TOKEN_SELF_HEAL_AFTER_MS) {
    return false;
  }
  if (typeof input.sessionOutputTokens === 'number' && input.sessionOutputTokens > 0) {
    return false;
  }
  if (typeof input.sessionApiCallCount === 'number' && input.sessionApiCallCount > 0) {
    return false;
  }
  return true;
}

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
