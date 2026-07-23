import type { HermesMessage } from '../types/chat';
import type { MegaSessionLevel } from './sessionTokenGuards';

/** Calm non-blocking status while model context is rotated behind the scenes. */
export const MEGA_SESSION_OPTIMIZING_COPY = 'Optimizing conversation…';

/** How many recent user/assistant turns to keep visible after auto-heal. */
export const MEGA_AUTO_HEAL_VISIBLE_TURN_LIMIT = 12;

/**
 * Product rule (2026-07-22): never use a homework "Start fresh chat" nag as the
 * primary remedy for large context. Auto-heal instead.
 */
export function shouldPreferAutoHealOverFreshNag(): boolean {
  return true;
}

/** Warn and block both trigger silent session continuation. */
export function shouldAutoHealMegaSession(level: MegaSessionLevel): boolean {
  return level === 'warn' || level === 'block';
}

/**
 * One-shot auto-heal per session id (mega warn/block or compaction stall).
 * Avoids alert loops while the previous session is still classified mega.
 */
export function shouldTriggerMegaAutoHeal(opts: {
  level: MegaSessionLevel;
  sessionId: string | null | undefined;
  alreadyHealedSessionId: string | null | undefined;
  isBusy: boolean;
}): boolean {
  if (opts.isBusy || !opts.sessionId) {
    return false;
  }
  if (!shouldAutoHealMegaSession(opts.level)) {
    return false;
  }
  return opts.alreadyHealedSessionId !== opts.sessionId;
}

export function megaSessionOptimizingCopy(): string {
  return MEGA_SESSION_OPTIMIZING_COPY;
}

/** Banner/status copy — never a Start-fresh CTA. */
export function megaSessionAutoHealStatusCopy(isOptimizing: boolean): string | null {
  if (isOptimizing) {
    return MEGA_SESSION_OPTIMIZING_COPY;
  }
  return null;
}

/** True when primary UX must not surface a Start-fresh homework nag. */
export function shouldShowStartFreshNagAsPrimary(): boolean {
  return false;
}

function isDisplayableChatRole(role: string | undefined): boolean {
  const normalized = role?.toLowerCase() ?? '';
  return normalized === 'user' || normalized === 'assistant';
}

function messageHasVisibleText(message: HermesMessage): boolean {
  const text = (message.content ?? message.rawContent ?? '').toString().trim();
  return text.length > 0;
}

/**
 * Keep the last N user/assistant turns for on-screen continuity after model
 * context reset. Does not invent messages; empty input → empty output.
 */
export function selectRecentTurnsForDisplay(
  messages: readonly HermesMessage[],
  limit: number = MEGA_AUTO_HEAL_VISIBLE_TURN_LIMIT,
): HermesMessage[] {
  if (!Array.isArray(messages) || messages.length === 0 || limit <= 0) {
    return [];
  }
  const visible = messages.filter(
    (message) => isDisplayableChatRole(message.role) && messageHasVisibleText(message),
  );
  if (visible.length === 0) {
    return [];
  }
  return visible.slice(-limit);
}

/**
 * After auto-heal, local recent turns must remain when the new gateway session
 * is still empty — never blank the user's visible history incorrectly.
 */
export function shouldKeepLocalHistoryAfterAutoHeal(opts: {
  preserveLocalTranscript: boolean;
  serverMessageCount: number;
  localRecentCount: number;
}): boolean {
  if (!opts.preserveLocalTranscript) {
    return false;
  }
  if (opts.localRecentCount <= 0) {
    return false;
  }
  return opts.serverMessageCount === 0;
}
