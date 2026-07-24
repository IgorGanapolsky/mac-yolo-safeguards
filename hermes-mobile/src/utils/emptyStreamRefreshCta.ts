import type { HermesMessage } from '../types/chat';
import { EMPTY_STREAM_TIMEOUT_PLACEHOLDER } from './streamAssistantText';

/** Shown above composer while auto-polling for reply text after a soft timeout. */
export const EMPTY_STREAM_REFRESH_BANNER_HINT =
  'Still waiting for reply text from your Mac. ThumbGate is checking automatically — Stop if a run is active, or start a fresh chat.';

export function emptyStreamBannerHint(elapsedMs: number): string {
  const elapsedSec = Math.max(1, Math.floor(elapsedMs / 1000));
  if (elapsedMs < 30_000) {
    return EMPTY_STREAM_REFRESH_BANNER_HINT;
  }
  return `Checking your Mac for a reply… (${elapsedSec}s). Stop if a run is active, or start a fresh chat.`;
}

export function messageIsEmptyStreamTimeout(content: string | undefined): boolean {
  const body = content?.trim() ?? '';
  if (body === EMPTY_STREAM_TIMEOUT_PLACEHOLDER) {
    return true;
  }
  return body.startsWith('Still no reply text.');
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
    if (/pull to refresh/i.test(literal)) {
      throw new Error(`${label} must not tell users to "pull to refresh"`);
    }
  }
}
