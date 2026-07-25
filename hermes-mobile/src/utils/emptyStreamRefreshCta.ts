import type { HermesMessage } from '../types/chat';
import {
  EMPTY_STREAM_HARD_STOP_MS,
  EMPTY_STREAM_HARD_STOP_STATUS,
  shouldHardStopEmptyStreamWait,
} from './emptyStreamReplyRecovery';
import { EMPTY_STREAM_TIMEOUT_PLACEHOLDER } from './streamAssistantText';

/** Shown above composer while auto-polling for reply text after a soft timeout. */
export const EMPTY_STREAM_REFRESH_BANNER_HINT =
  'No reply from your Mac yet. Tap Check now, or Start fresh chat.';

export function emptyStreamBannerHint(elapsedMs: number): string {
  if (shouldHardStopEmptyStreamWait(elapsedMs)) {
    return EMPTY_STREAM_HARD_STOP_STATUS;
  }
  const elapsedSec = Math.max(1, Math.floor(elapsedMs / 1000));
  if (elapsedMs < 30_000) {
    return EMPTY_STREAM_REFRESH_BANNER_HINT;
  }
  return `No reply from your Mac yet (${elapsedSec}s). Tap Check now, or Start fresh chat.`;
}

/** Cap live "Waiting Xm" display so a Jul-23 prompt cannot paint "Waiting 57m" forever. */
export function emptyStreamDisplayElapsedMs(elapsedMs: number): number {
  return Math.min(Math.max(0, elapsedMs), EMPTY_STREAM_HARD_STOP_MS);
}

export function messageIsEmptyStreamTimeout(content: string | undefined): boolean {
  const body = content?.trim() ?? '';
  if (body === EMPTY_STREAM_TIMEOUT_PLACEHOLDER) {
    return true;
  }
  // Current + legacy soft-timeout placeholders (shipped builds).
  return (
    body.startsWith('No reply from your Mac yet') ||
    body.startsWith('Still no reply text.')
  );
}

/** True when the latest user turn ended with a timed-out empty-stream assistant bubble. */
export function shouldShowEmptyStreamRefreshCta(messages: readonly HermesMessage[]): boolean {
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

export const USER_FACING_EMPTY_STREAM_COPY_FILES = [
  'src/utils/streamAssistantText.ts',
  'src/utils/emptyStreamReplyRecovery.ts',
] as const;

export function assertNoPullToRefreshCopy(source: string, label: string): void {
  const stringLiterals = source.match(/'[^']*'|"[^"]*"/g) ?? [];
  for (const literal of stringLiterals) {
    if (/must not (tell users|use gateway jargon)/i.test(literal)) {
      continue;
    }
    if (/pull to refresh/i.test(literal)) {
      throw new Error(`${label} must not tell users to pull-to-refresh`);
    }
    if (
      /stop if a run is active/i.test(literal) ||
      /a run is still active/i.test(literal) ||
      /stop an active run/i.test(literal) ||
      /stop the run/i.test(literal)
    ) {
      throw new Error(`${label} must not use gateway jargon about an active run`);
    }
  }
}
