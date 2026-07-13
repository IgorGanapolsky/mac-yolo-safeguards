import type { HermesSession } from '../types/chat';

/** Warn before sending on very large sessions — context can take hours or fail. */
export const MEGA_SESSION_TOKEN_WARN = 300_000;

/** Block new sends unless the user starts a fresh forked chat. */
export const MEGA_SESSION_TOKEN_BLOCK = 2_000_000;

export type MegaSessionLevel = 'normal' | 'warn' | 'block';

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
  return `Your Mac is processing a very large session (${label} tokens) — replies may take hours or fail. Start a fresh chat for faster responses.`;
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
  return `This thread already has about ${label} tokens on your Mac. New messages may take a long time or stall. Start a fresh chat instead?`;
}
