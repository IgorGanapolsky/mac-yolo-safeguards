import type { HermesSession } from '../types/chat';

type SessionTokenFields = Pick<
  HermesSession,
  'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'api_call_count'
>;

/**
 * Estimated CURRENT context (warn/block) thresholds.
 *
 * The gateway auto-compacts at ~30% of the model window (≈60k for a 200k
 * model), so a healthy session's per-call context stays well under 100k.
 * A sustained estimate ≥120k means compaction is not keeping up; ≥200k is
 * at/over the largest fleet window — sends will fail or thrash.
 */
export const MEGA_CONTEXT_TOKEN_WARN = 120_000;
export const MEGA_CONTEXT_TOKEN_BLOCK = 200_000;

/**
 * Legacy CUMULATIVE-traffic thresholds — fallback only when the gateway
 * doesn't report `api_call_count`. Cumulative input+output+cache_read grows
 * by ~context-size on every API call, so it measures traffic, not size.
 * Kept tighter than older 350k/800k so dogfood stall classes still hard-block.
 */
export const MEGA_SESSION_TOKEN_WARN = 100_000;
export const MEGA_SESSION_TOKEN_BLOCK = 500_000;

export type MegaSessionLevel = 'normal' | 'warn' | 'block';

export type MegaSessionSendChoice = 'send_anyway' | 'cancel' | 'fresh';

/** Lifetime token traffic (billing-style counter). NOT the context size. */
export function sessionTotalTokens(
  session: SessionTokenFields | null | undefined,
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

/**
 * Estimated current context size: average prompt tokens per API call.
 * Returns null when the gateway didn't report api_call_count.
 */
export function estimatedContextTokens(
  session: SessionTokenFields | null | undefined,
): number | null {
  const calls = session?.api_call_count ?? 0;
  if (!session || calls <= 0) {
    return null;
  }
  const promptTokens =
    (session.input_tokens ?? 0) + (session.cache_read_tokens ?? 0);
  if (promptTokens <= 0) {
    return null;
  }
  return Math.round(promptTokens / calls);
}

/** Token count shown in banner/alert copy: context estimate, else lifetime total. */
export function megaSessionDisplayTokens(
  session: SessionTokenFields | null | undefined,
): number {
  return estimatedContextTokens(session) ?? sessionTotalTokens(session);
}

export function classifyMegaSession(
  session: SessionTokenFields | null | undefined,
): MegaSessionLevel {
  const context = estimatedContextTokens(session);
  if (context != null) {
    if (context >= MEGA_CONTEXT_TOKEN_BLOCK) {
      return 'block';
    }
    if (context >= MEGA_CONTEXT_TOKEN_WARN) {
      return 'warn';
    }
    return 'normal';
  }
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
  session: SessionTokenFields | null | undefined,
): boolean {
  return classifyMegaSession(session) !== 'normal';
}

/** True when Send must migrate off this session (auto-heal) before delivery. */
export function isMegaSessionSendBlocked(
  session: SessionTokenFields | null | undefined,
): boolean {
  return classifyMegaSession(session) === 'block';
}

/**
 * Pure send-gate used by ChatScreen + unit tests.
 * - normal → allow
 * - warn → only `send_anyway` (legacy) or auto-heal path (`fresh`)
 * - block → never allow send on the same session (auto-heal + resend migrates)
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
  return choice === 'send_anyway' || choice === 'fresh';
}

/**
 * Auto-heal + resend on warn/block so the typed draft is never stuck behind a
 * homework "Start fresh" alert.
 */
export function shouldAutoFreshAndResendOnMegaBlock(level: MegaSessionLevel): boolean {
  return level === 'warn' || level === 'block';
}

/** Recents rail badge for large / blocked threads. */
export function megaSessionRecentsBadge(
  session: SessionTokenFields | null | undefined,
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

/**
 * WARN reopen no longer shows a Start-fresh homework alert — idle auto-heal owns it.
 * Kept for callers that still branch on warn; always false as a nag trigger.
 */
export function shouldSuggestFreshOnSessionSelect(
  _session: SessionTokenFields | null | undefined,
): boolean {
  return false;
}

/** Selecting a BLOCK session from Recents should auto-heal instead of reopen. */
export function shouldForceFreshOnSessionSelect(
  session: SessionTokenFields | null | undefined,
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
  return `This chat's working context is very large (~${label} tokens) — optimizing conversation in the background.`;
}

export function megaSessionSendBlockedCopy(totalTokens: number): string {
  const label = formatMegaSessionTokenCount(totalTokens);
  return `This chat's context is too large (~${label} tokens) — optimizing conversation so you can keep chatting.`;
}

export function megaSessionSendWarnTitle(): string {
  return 'Very large chat session';
}

export function megaSessionSendWarnMessage(totalTokens: number): string {
  const label = formatMegaSessionTokenCount(totalTokens);
  if (totalTokens >= MEGA_SESSION_TOKEN_BLOCK || totalTokens >= MEGA_CONTEXT_TOKEN_BLOCK) {
    return `This thread's working context is about ${label} tokens — too large to send safely. Optimizing conversation (your Mac stays connected).`;
  }
  return `This thread's working context is about ${label} tokens on your computer. Optimizing conversation for faster replies.`;
}

export function megaSessionForceFreshSelectCopy(totalTokens: number): string {
  const label = formatMegaSessionTokenCount(totalTokens);
  return `This chat's context is too large (~${label} tokens) to reopen safely. Optimizing conversation…`;
}

/**
 * Header chrome: never use a Start-fresh homework nag as the primary large-context
 * remedy (2026-07-22). Auto-heal owns remediation; token strip stays informative.
 */
export function shouldShowLargeChatHeaderWarning(
  _session: SessionTokenFields | null | undefined,
  _runInputTokens?: number | null,
): boolean {
  return false;
}
