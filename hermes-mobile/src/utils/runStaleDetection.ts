import type { RunProgressState } from '../types/chatDisplay';

/** Show "Taking longer than expected" once a run exceeds this age. */
export const RUN_STALE_WARN_MS = 15 * 60 * 1000;

/** Auto-fail client-side banner when a run exceeds this age (gateway may still be working). */
export const RUN_STALE_AUTO_FAIL_MS = 20 * 60 * 1000;

/** No detail/phase change for this long → idle stall hint (token-only ticks do not reset). */
export const RUN_STALE_IDLE_MS = 3 * 60 * 1000;

export const RUN_STALE_LONG_HINT =
  'Taking longer than expected — tap Stop if your computer looks stuck.';

export const RUN_STALE_IDLE_HINT =
  'No progress updates for a few minutes — tap Stop to cancel on your computer.';

export const RUN_STALE_TIMEOUT_DETAIL =
  'Run timed out — stopped waiting on your computer. Tap Stop on your Mac or start a new message.';

export const RUN_NO_TOKEN_FAIL_MS = 90_000;

export const RUN_NO_TOKEN_FAIL_DETAIL =
  'No reply yet — your computer may be slow or stuck. Tap Stop and try again.';

export type RunStaleLevel = 'normal' | 'long' | 'idle' | 'expired';

export function isRunAwaitingFirstToken(progress: RunProgressState): boolean {
  if (progress.phase === 'completed' || progress.phase === 'failed') {
    return false;
  }
  return (progress.outputTokens ?? 0) <= 0;
}

export function shouldFailRunAwaitingFirstToken(
  progress: RunProgressState | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!progress || !isRunAwaitingFirstToken(progress)) {
    return false;
  }
  return nowMs - progress.startedAtMs >= RUN_NO_TOKEN_FAIL_MS;
}

export function msUntilNoTokenFail(progress: RunProgressState, nowMs = Date.now()): number {
  return Math.max(0, RUN_NO_TOKEN_FAIL_MS - (nowMs - progress.startedAtMs));
}

export function isMeaningfulRunProgressChange(
  prev: RunProgressState | null | undefined,
  next: RunProgressState,
): boolean {
  if (!prev) {
    return true;
  }
  return prev.phase !== next.phase || (prev.detail ?? '') !== (next.detail ?? '');
}

export function stampRunProgressActivity(
  prev: RunProgressState | null | undefined,
  next: RunProgressState,
  nowMs = Date.now(),
): RunProgressState {
  const lastProgressAtMs = isMeaningfulRunProgressChange(prev, next)
    ? nowMs
    : (prev?.lastProgressAtMs ?? prev?.startedAtMs ?? next.startedAtMs);
  return { ...next, lastProgressAtMs };
}

export function classifyRunStale(
  progress: RunProgressState,
  nowMs = Date.now(),
): RunStaleLevel {
  const elapsedMs = Math.max(0, nowMs - progress.startedAtMs);
  if (elapsedMs >= RUN_STALE_AUTO_FAIL_MS) {
    return 'expired';
  }
  if (elapsedMs >= RUN_STALE_WARN_MS) {
    return 'long';
  }
  const lastProgressAtMs = progress.lastProgressAtMs ?? progress.startedAtMs;
  const idleMs = Math.max(0, nowMs - lastProgressAtMs);
  if (idleMs >= RUN_STALE_IDLE_MS && elapsedMs >= 2 * 60 * 1000) {
    return 'idle';
  }
  return 'normal';
}

export function runStaleHint(level: RunStaleLevel): string | null {
  if (level === 'long' || level === 'expired') {
    return RUN_STALE_LONG_HINT;
  }
  if (level === 'idle') {
    return RUN_STALE_IDLE_HINT;
  }
  return null;
}

export function msUntilRunStaleAutoFail(
  progress: RunProgressState,
  nowMs = Date.now(),
): number {
  return Math.max(0, RUN_STALE_AUTO_FAIL_MS - (nowMs - progress.startedAtMs));
}

const TERMINAL_GATEWAY_RUN_STATUSES = new Set([
  'completed',
  'failed',
  'stopped',
  'cancelled',
  'canceled',
  'stopping',
]);

export function isTerminalGatewayRunStatus(status: string | undefined | null): boolean {
  if (!status) {
    return false;
  }
  return TERMINAL_GATEWAY_RUN_STATUSES.has(status.trim().toLowerCase());
}
