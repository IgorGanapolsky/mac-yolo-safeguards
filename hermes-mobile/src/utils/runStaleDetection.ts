import type { RunProgressState } from '../types/chatDisplay';
import type { HermesSession } from '../types/chat';
import { isMegaSession, sessionTotalTokens } from './sessionTokenGuards';

type SessionTokenFields = Pick<
  HermesSession,
  'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'api_call_count'
>;

function resolveRunStaleAutoFailMs(
  progress: RunProgressState,
  session?: SessionTokenFields | null,
): number {
  const sessionTokens = session ? sessionTotalTokens(session) : 0;
  const progressTokens =
    (progress.inputTokens ?? 0) + (progress.outputTokens ?? 0) + (progress.totalTokens ?? 0);
  if (isMegaSession(session) || progressTokens >= 500_000 || sessionTokens >= 500_000) {
    // Standing order: mega sessions must not be killed early by phone-side timers.
    return MEGA_SESSION_RUN_STALE_AUTO_FAIL_MS;
  }
  return RUN_STALE_AUTO_FAIL_MS;
}

/** Show "Taking longer than expected" once a run exceeds this age. */
export const RUN_STALE_WARN_MS = 15 * 60 * 1000;

/** Auto-fail client-side banner when a run exceeds this age (gateway may still be working). */
export const RUN_STALE_AUTO_FAIL_MS = 20 * 60 * 1000;

/** Mega sessions may run for hours — never use a shorter client fail than normal runs. */
export const MEGA_SESSION_RUN_STALE_AUTO_FAIL_MS = RUN_STALE_AUTO_FAIL_MS;

/** No detail/phase change for this long → idle stall hint (token-only ticks do not reset). */
export const RUN_STALE_IDLE_MS = 3 * 60 * 1000;

/** Fail active runs with no meaningful progress for this long (stream may have died). */
export const RUN_STREAM_IDLE_FAIL_MS = 5 * 60 * 1000;

export const RUN_STREAM_IDLE_FAIL_DETAIL =
  'No live progress from your computer — recovering automatically. Start a fresh chat if this keeps happening.';

/**
 * True when the client should auto-clear a stalled run without waiting for the user
 * to babysit Stop/resend (Connected + green Tailscale stall class).
 */
export function shouldAutoClearStalledRun(
  progress: RunProgressState | null | undefined,
  nowMs = Date.now(),
  session?: SessionTokenFields | null,
): boolean {
  if (!progress || progress.phase === 'completed' || progress.phase === 'failed') {
    return false;
  }
  if (shouldHardTimeoutRun(progress, nowMs, session)) {
    return true;
  }
  if (shouldFailRunAwaitingFirstToken(progress, nowMs, { session })) {
    return true;
  }
  if (shouldFailRunForStreamIdle(progress, nowMs, session)) {
    return true;
  }
  return classifyRunStale(progress, nowMs, session) === 'expired';
}

export const RUN_STALE_LONG_HINT =
  'Taking longer than expected — tap Stop if your computer looks stuck.';

export const RUN_STALE_IDLE_HINT =
  'No progress updates for a few minutes — tap Stop to cancel on your computer.';

export const RUN_STALE_TIMEOUT_DETAIL =
  'Run timed out — stopped waiting on your computer. Tap Stop on your Mac or start a new message.';

/**
 * Fail only after this long with neither output tokens nor meaningful progress.
 * 45s was a false-positive class: tool-heavy Mac work (Agent-sync, vault, bash)
 * often produces detail/tool ticks without streaming tokens — Connected stayed green
 * while the phone screamed "Run stalled" and auto-resend echoed the prompt.
 */
export const RUN_NO_TOKEN_FAIL_MS = 3 * 60 * 1000;

export const RUN_NO_TOKEN_FAIL_DETAIL =
  'Still waiting for a reply — recovering automatically…';

/**
 * Absolute wall-clock fail that ignores stuck streamInFlight.
 * Prevents Connected+Waiting forever when SSE never closes (1h hang class).
 *
 * 2m was a false-kill class (2026-07-23): mini local qwen3.5:9b on a ~445k
 * session took latency=274.3s before first tokens while the phone already
 * painted "Timed out waiting for your computer". Keep this above measured
 * local-LLM first-token latency; stream-idle + no-token still recover sooner
 * when the SSE is actually dead.
 */
export const RUN_HARD_TIMEOUT_MS = 10 * 60 * 1000;

/** Mega / huge-context turns (local Ollama) get a longer absolute ceiling. */
export const MEGA_SESSION_RUN_HARD_TIMEOUT_MS = 15 * 60 * 1000;

export const RUN_HARD_TIMEOUT_DETAIL =
  'Timed out waiting for your computer — tap ↑ to send again, or Stop if a run is still active.';

export type RunStaleLevel = 'normal' | 'long' | 'idle' | 'expired';

export type NoTokenFailOptions = {
  /** Open SSE / chat stream means the Mac is still talking — never false-stall. */
  streamInFlight?: boolean;
  /** When set, mega sessions use MEGA_SESSION_RUN_HARD_TIMEOUT_MS. */
  session?: SessionTokenFields | null;
};

function resolveRunHardTimeoutMs(session?: SessionTokenFields | null): number {
  if (isMegaSession(session)) {
    return MEGA_SESSION_RUN_HARD_TIMEOUT_MS;
  }
  const sessionTokens = session ? sessionTotalTokens(session) : 0;
  if (sessionTokens >= 500_000) {
    return MEGA_SESSION_RUN_HARD_TIMEOUT_MS;
  }
  return RUN_HARD_TIMEOUT_MS;
}

export function isRunAwaitingFirstToken(progress: RunProgressState): boolean {
  if (progress.phase === 'completed' || progress.phase === 'failed') {
    return false;
  }
  return (progress.outputTokens ?? 0) <= 0;
}

export function shouldHardTimeoutRun(
  progress: RunProgressState | null | undefined,
  nowMs = Date.now(),
  session?: SessionTokenFields | null,
): boolean {
  if (!progress || progress.phase === 'completed' || progress.phase === 'failed') {
    return false;
  }
  return nowMs - progress.startedAtMs >= resolveRunHardTimeoutMs(session);
}

export function msUntilRunHardTimeout(
  progress: RunProgressState,
  nowMs = Date.now(),
  session?: SessionTokenFields | null,
): number {
  return Math.max(0, resolveRunHardTimeoutMs(session) - (nowMs - progress.startedAtMs));
}

export function shouldFailRunAwaitingFirstToken(
  progress: RunProgressState | null | undefined,
  nowMs = Date.now(),
  options?: NoTokenFailOptions,
): boolean {
  if (!progress || !isRunAwaitingFirstToken(progress)) {
    return false;
  }
  // Stuck open SSE must not block forever — absolute hard timeout wins.
  if (shouldHardTimeoutRun(progress, nowMs, options?.session)) {
    return true;
  }
  if (options?.streamInFlight) {
    return false;
  }
  const lastProgressAtMs = progress.lastProgressAtMs ?? progress.startedAtMs;
  // Tool/detail ticks reset the clock — Mac is alive, just not streaming tokens yet.
  if (nowMs - lastProgressAtMs < RUN_NO_TOKEN_FAIL_MS) {
    return false;
  }
  return nowMs - progress.startedAtMs >= RUN_NO_TOKEN_FAIL_MS;
}

export function msUntilNoTokenFail(
  progress: RunProgressState,
  nowMs = Date.now(),
  options?: NoTokenFailOptions,
): number {
  const hardRemaining = msUntilRunHardTimeout(progress, nowMs, options?.session);
  if (options?.streamInFlight) {
    return hardRemaining;
  }
  const lastProgressAtMs = progress.lastProgressAtMs ?? progress.startedAtMs;
  const sinceStart = Math.max(0, RUN_NO_TOKEN_FAIL_MS - (nowMs - progress.startedAtMs));
  const sinceProgress = Math.max(0, RUN_NO_TOKEN_FAIL_MS - (nowMs - lastProgressAtMs));
  return Math.min(hardRemaining, Math.max(sinceStart, sinceProgress));
}

export function isMeaningfulRunProgressChange(
  prev: RunProgressState | null | undefined,
  next: RunProgressState,
): boolean {
  if (!prev) {
    return true;
  }
  const outputAdvanced =
    typeof next.outputTokens === 'number' &&
    next.outputTokens > (typeof prev.outputTokens === 'number' ? prev.outputTokens : 0);
  const totalAdvanced =
    typeof next.totalTokens === 'number' &&
    next.totalTokens > (typeof prev.totalTokens === 'number' ? prev.totalTokens : 0);
  return (
    prev.phase !== next.phase ||
    (prev.detail ?? '') !== (next.detail ?? '') ||
    outputAdvanced ||
    totalAdvanced
  );
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

export function shouldFailRunForStreamIdle(
  progress: RunProgressState | null | undefined,
  nowMs = Date.now(),
  session?: SessionTokenFields | null,
): boolean {
  if (!progress || progress.phase === 'completed' || progress.phase === 'failed') {
    return false;
  }
  const lastProgressAtMs = progress.lastProgressAtMs ?? progress.startedAtMs;
  const idleMs = Math.max(0, nowMs - lastProgressAtMs);
  const idleLimit = RUN_STREAM_IDLE_FAIL_MS;
  return idleMs >= idleLimit && nowMs - progress.startedAtMs >= 60_000;
}

export function msUntilStreamIdleFail(
  progress: RunProgressState,
  nowMs = Date.now(),
  session?: SessionTokenFields | null,
): number {
  const lastProgressAtMs = progress.lastProgressAtMs ?? progress.startedAtMs;
  const idleLimit = RUN_STREAM_IDLE_FAIL_MS;
  const startedGraceMs = Math.max(0, 60_000 - (nowMs - progress.startedAtMs));
  const idleRemainingMs = Math.max(0, idleLimit - (nowMs - lastProgressAtMs));
  return Math.max(startedGraceMs, idleRemainingMs);
}

export function classifyRunStale(
  progress: RunProgressState,
  nowMs = Date.now(),
  session?: SessionTokenFields | null,
): RunStaleLevel {
  const elapsedMs = Math.max(0, nowMs - progress.startedAtMs);
  const autoFailMs = resolveRunStaleAutoFailMs(progress, session);
  if (elapsedMs >= autoFailMs) {
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
  session?: SessionTokenFields | null,
): number {
  return Math.max(0, resolveRunStaleAutoFailMs(progress, session) - (nowMs - progress.startedAtMs));
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
