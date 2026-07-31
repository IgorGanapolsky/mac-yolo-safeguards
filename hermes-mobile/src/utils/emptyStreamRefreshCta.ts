import type { HermesMessage } from '../types/chat';
import {
  EMPTY_REPLY_FAILURE_REASON,
  EMPTY_STREAM_HARD_STOP_MS,
  EMPTY_STREAM_HARD_STOP_STATUS,
  shouldHardStopEmptyStreamWait,
  serverHasAssistantReplyAfterLastUser,
} from './emptyStreamReplyRecovery';
import { EMPTY_STREAM_TIMEOUT_PLACEHOLDER } from './streamAssistantText';

/** Shown above composer while auto-polling for reply text after a soft timeout. */
export const EMPTY_STREAM_REFRESH_BANNER_HINT =
  'Still waiting for reply text from your Mac. Hermes is checking automatically — Stop if a run is active, open Leash for approve/deny/warn, or start a fresh chat.';

export function emptyStreamBannerHint(elapsedMs: number): string {
  if (shouldHardStopEmptyStreamWait(elapsedMs)) {
    return EMPTY_STREAM_HARD_STOP_STATUS;
  }
  const elapsedSec = Math.max(1, Math.floor(elapsedMs / 1000));
  if (elapsedMs < 30_000) {
    return EMPTY_STREAM_REFRESH_BANNER_HINT;
  }
  return `Checking your Mac for a reply… (${elapsedSec}s). Stop if a run is active, open Leash for approvals, or start a fresh chat.`;
}

/** Cap live "Waiting Xm" display so a Jul-23 prompt cannot paint "Waiting 57m" forever. */
export function emptyStreamDisplayElapsedMs(elapsedMs: number): number {
  return Math.min(Math.max(0, elapsedMs), EMPTY_STREAM_HARD_STOP_MS);
}

export function messageIsEmptyStreamTimeout(content: string | undefined): boolean {
  const body = content?.trim() ?? '';
  if (!body) {
    return false;
  }
  if (body === EMPTY_STREAM_TIMEOUT_PLACEHOLDER) {
    return true;
  }
  if (body === EMPTY_STREAM_HARD_STOP_STATUS) {
    return true;
  }
  // Soft-timeout placeholder + legacy hard-stop copy that shipped as bubbles/status.
  return (
    body.startsWith('Still no reply text.') ||
    body.startsWith('Stopped waiting on your Mac')
  );
}

/**
 * Drop empty-stream timeout bubbles once a real assistant reply exists for the
 * current turn. Prevents "answer + Stopped waiting" stacked UX.
 */
export function stripSupersededEmptyStreamTimeouts(
  messages: readonly HermesMessage[],
): HermesMessage[] {
  if (!serverHasAssistantReplyAfterLastUser(messages as HermesMessage[])) {
    return messages as HermesMessage[];
  }
  return messages.filter((message) => {
    if (message?.role?.toLowerCase() !== 'assistant') {
      return true;
    }
    return !messageIsEmptyStreamTimeout(message.content);
  });
}

/** True when the latest user turn is stuck on empty-stream timeout with no real reply. */
export function shouldShowEmptyStreamRefreshCta(messages: readonly HermesMessage[]): boolean {
  // Real answer already on screen — never show the empty-stream recovery chrome.
  if (serverHasAssistantReplyAfterLastUser(messages as HermesMessage[])) {
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
  for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role?.toLowerCase() !== 'assistant') {
      continue;
    }
    if (messageIsEmptyStreamTimeout(message.content)) {
      return true;
    }
  }
  return false;
}

/** Status/footer strings that must clear once a real reply lands. */
export function isEmptyStreamRecoveryStatus(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }
  const body = status.trim();
  if (!body) {
    return false;
  }
  if (body === EMPTY_STREAM_HARD_STOP_STATUS || body === EMPTY_REPLY_FAILURE_REASON) {
    return true;
  }
  return (
    messageIsEmptyStreamTimeout(body) ||
    body.startsWith('Checking your Mac') ||
    body.startsWith('Checking your computer') ||
    body.startsWith('Still waiting for reply text') ||
    body.startsWith('Working on your computer… Hermes may be using tools') ||
    body.startsWith('Stopped waiting on your Mac')
  );
}

export const USER_FACING_EMPTY_STREAM_COPY_FILES = [
  'src/utils/streamAssistantText.ts',
  'src/utils/emptyStreamReplyRecovery.ts',
] as const;

export function assertNoPullToRefreshCopy(source: string, label: string): void {
  const stringLiterals = source.match(/'[^']*'|"[^"]*"/g) ?? [];
  for (const literal of stringLiterals) {
    if (/pull to refresh/i.test(literal)) {
      throw new Error(`${label} must not tell users to "pull to refresh"`);
    }
  }
}
