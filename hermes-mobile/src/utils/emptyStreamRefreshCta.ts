import type { HermesMessage } from '../types/chat';
import {
  EMPTY_STREAM_HARD_STOP_MS,
  EMPTY_STREAM_HARD_STOP_STATUS,
  emptyStreamHardStopStatus,
  shouldHardStopEmptyStreamWait,
} from './emptyStreamReplyRecovery';
import { EMPTY_STREAM_TIMEOUT_PLACEHOLDER } from './streamAssistantText';
import {
  buildNoReplyNextSteps,
  isNoReplyGuidanceCopy,
  type NoReplyGuidanceContext,
} from './noReplyGuidance';

/**
 * Shown above composer while auto-polling for reply text after a soft timeout.
 * CONDITIONAL (2026-07-25): next steps name Leash only when approvals are waiting and
 * Stop only when a run is active — see noReplyGuidance.ts.
 */
export function emptyStreamRefreshBannerHint(context?: NoReplyGuidanceContext): string {
  return `Still waiting for reply text from your Mac. Hermes is checking automatically — ${buildNoReplyNextSteps(context)}`;
}

export const EMPTY_STREAM_REFRESH_BANNER_HINT = emptyStreamRefreshBannerHint();

export function emptyStreamBannerHint(
  elapsedMs: number,
  context?: NoReplyGuidanceContext,
): string {
  if (shouldHardStopEmptyStreamWait(elapsedMs)) {
    return context ? emptyStreamHardStopStatus(context) : EMPTY_STREAM_HARD_STOP_STATUS;
  }
  const elapsedSec = Math.max(1, Math.floor(elapsedMs / 1000));
  if (elapsedMs < 30_000) {
    return emptyStreamRefreshBannerHint(context);
  }
  return `Checking your Mac for a reply… (${elapsedSec}s). ${buildNoReplyNextSteps(context)}`;
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
  // Any conditional no-reply variant (see noReplyGuidance.ts) + legacy wording.
  return isNoReplyGuidanceCopy(body);
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
  'src/utils/noReplyGuidance.ts',
] as const;

export function assertNoPullToRefreshCopy(source: string, label: string): void {
  const stringLiterals = source.match(/'[^']*'|"[^"]*"/g) ?? [];
  for (const literal of stringLiterals) {
    if (/pull to refresh/i.test(literal)) {
      throw new Error(`${label} must not tell users to "pull to refresh"`);
    }
  }
}
