import type { HermesSession } from '../types/chat';

/**
 * Warn before sending on large sessions — context compresses and often stalls.
 * Set below the ~397k dogfood stall so the Start-fresh banner appears before 500k.
 */
export const MEGA_SESSION_TOKEN_WARN = 350_000;

/**
 * Hard-block new sends unless the user starts a fresh forked chat.
 * 800k is below the 1.7M compaction-thrash class; 2M left too much "Send anyway" theater.
 */
export const MEGA_SESSION_TOKEN_BLOCK = 800_000;

export type MegaSessionLevel = 'normal' | 'warn' | 'block';

export type MegaSessionSendChoice = 'send_anyway' | 'cancel' | 'fresh';

export function sessionTotalTokens(
  session: Pick<
    HermesSession,
    'input_tokens' | 'output_tokens' | 'cache_read_tokens'
  > | null | undefined,
): number {
  if (!session) {
    return 0;
  }
  return (
    (session.input_tokens ?? 0) +
    (session.output_tokens ?? 0) +
    (session.cache_read_tokens ?? 0)
  );
}

export function classifyMegaSession(
  session: Pick<
    HermesSession,
    'input_tokens' | 'output_tokens' | 'cache_read_tokens'
  > | null | undefined,
): MegaSessionLevel {
  const total = sessionTotalTokens(session);
  if (total >= MEGA_SESSION_TOKEN_BLOCK) {
    return 'block';
  }
  if (total >= MEGA_SESSION_TOKEN_WARN) {
    return 'warn';
  }
  return 'normal';
}

export function isMegaSession(
  session: Pick<
    HermesSession,
    'input_tokens' | 'output_tokens' | 'cache_read_tokens'
  > | null | undefined,
): boolean {
  return classifyMegaSession(session) !== 'normal';
}

/** True when Send must be refused — only Start fresh chat is allowed. */
export function isMegaSessionSendBlocked(
  session: Pick<
    HermesSession,
    'input_tokens' | 'output_tokens' | 'cache_read_tokens'
  > | null | undefined,
): boolean {
  return classifyMegaSession(session) === 'block';
}

/**
 * Pure send-gate used by ChatScreen + unit tests.
 * - normal → allow
 * - warn → only `send_anyway`
 * - block → never allow send on the same session (auto-fresh + resend migrates)
 */
export function shouldAllowMegaSessionSend(
  level: MegaSessionLevel,
  choice: MegaSessionSendChoice = 'cancel',
): boolean {
  if (level === 'normal') {
    return true;
  }
  if (level === 'block') {
    return false;
  }
  return choice === 'send_anyway';
}

/**
 * Hard-block Send: auto-start a fresh chat and deliver the already-typed draft
 * (no extra alert that drops the prompt). Keeps Start-fresh spinner/attachments.
 */
export function shouldAutoFreshAndResendOnMegaBlock(level: MegaSessionLevel): boolean {
  return level === 'block';
}

/** Recents rail badge for large / blocked threads. */
export function megaSessionRecentsBadge(
  session: Pick<
    HermesSession,
    'input_tokens' | 'output_tokens' | 'cache_read_tokens'
  > | null | undefined,
): string | null {
  const level = classifyMegaSession(session);
  if (level === 'block') {
    return 'Too large';
  }
  if (level === 'warn') {
    return 'Large';
  }
  return null;
}

/** Selecting a BLOCK session from Recents should force Start fresh instead of reopen. */
export function shouldForceFreshOnSessionSelect(
  session: Pick<
    HermesSession,
    'input_tokens' | 'output_tokens' | 'cache_read_tokens'
  > | null | undefined,
): boolean {
  return classifyMegaSession(session) === 'block';
}

export function formatMegaSessionTokenCount(totalTokens: number): string {
  if (totalTokens >= 1_000_000) {
    return `${(totalTokens / 1_000_000).toFixed(1)}M`;
  }
  if (totalTokens >= 1_000) {
    return `${Math.round(totalTokens / 1_000)}k`;
  }
  return String(totalTokens);
}

export function megaSessionBannerCopy(totalTokens: number): string {
  const label = formatMegaSessionTokenCount(totalTokens);
  return `Your computer is processing a very large session (${label} tokens) — replies may take hours or fail. Start a fresh chat for faster responses.`;
}

export function megaSessionSendBlockedCopy(totalTokens: number): string {
  const label = formatMegaSessionTokenCount(totalTokens);
  return `This chat is too large (${label} tokens) to send safely. Start a fresh chat to continue.`;
}

export function megaSessionSendWarnTitle(): string {
  return 'Very large chat session';
}

export function megaSessionSendWarnMessage(totalTokens: number): string {
  const label = formatMegaSessionTokenCount(totalTokens);
  return `This thread already has about ${label} tokens on your computer. New messages may take a long time or stall. Start a fresh chat instead?`;
}

export function megaSessionForceFreshSelectCopy(totalTokens: number): string {
  const label = formatMegaSessionTokenCount(totalTokens);
  return `This chat is too large (${label} tokens) to reopen safely. Start a fresh chat instead.`;
}
