import { getRunStatus, stopRun } from '../services/hermesGatewayClient';
import type { RunProgressState } from '../types/chatDisplay';
import { isSessionInUseError } from './chatErrors';
import { isActiveChatRun } from './runProgressDisplay';
import { isTerminalGatewayRunStatus } from './runStaleDetection';

const SESSION_RECOVERY_DELAY_MS = 900;
const SESSION_IN_USE_RETRY_DELAY_MS = 1500;
const SESSION_IN_USE_MAX_ATTEMPTS = 4;

export const WAITING_FOR_PRIOR_CHAT_DETAIL =
  'Waiting for your computer to finish the previous chat…';

export type SessionInUseWaitContext = {
  hasLiveRun: boolean;
};

export function isWaitingForPriorChatDetail(detail: string | undefined | null): boolean {
  return (detail ?? '').trim() === WAITING_FOR_PRIOR_CHAT_DETAIL;
}

/** Run ids the gateway still treats as active (not 404 / terminal). */
export async function filterLiveGatewayRunIds(
  gatewayUrl: string,
  apiKey: string | null | undefined,
  runIds: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(runIds.map((id) => id.trim()).filter(Boolean))];
  const live: string[] = [];
  for (const runId of unique) {
    try {
      const status = await getRunStatus(gatewayUrl, runId, apiKey);
      if (!status) {
        continue;
      }
      if (!isTerminalGatewayRunStatus(status.status)) {
        live.push(runId);
      }
    } catch {
      // Transient probe errors — assume live so we still attempt stop.
      live.push(runId);
    }
  }
  return live;
}

/** Drop client run banner when gateway has no live operator run to wait on. */
export async function reconcileStaleActiveRunProgress(
  gatewayUrl: string,
  apiKey: string | null | undefined,
  progress: RunProgressState,
  knownRunIds: readonly string[],
): Promise<'clear' | 'keep'> {
  if (progress.phase === 'completed' || progress.phase === 'failed') {
    return 'keep';
  }

  const runId = progress.runId?.trim();
  if (runId) {
    try {
      const status = await getRunStatus(gatewayUrl, runId, apiKey);
      if (!status || isTerminalGatewayRunStatus(status.status)) {
        return 'clear';
      }
      return 'keep';
    } catch {
      return 'keep';
    }
  }

  const live = await filterLiveGatewayRunIds(gatewayUrl, apiKey, knownRunIds);
  if (live.length === 0) {
    return 'clear';
  }
  return 'keep';
}

/** Clear client busy state when the gateway session froze but the phone still shows sending. */
export async function reconcileFrozenSessionBusyState(
  gatewayUrl: string,
  apiKey: string | null | undefined,
  progress: RunProgressState | null,
  isSending: boolean,
  knownRunIds: readonly string[],
  sessionLastActiveUnix?: number | null,
  nowMs = Date.now(),
): Promise<'clear' | 'keep'> {
  const frozenMs =
    sessionLastActiveUnix != null && Number.isFinite(sessionLastActiveUnix)
      ? Math.max(0, nowMs - sessionLastActiveUnix * 1000)
      : null;
  const clientBusy = isSending || Boolean(progress && isActiveChatRun(progress));
  if (!clientBusy) {
    return 'keep';
  }

  if (progress && isActiveChatRun(progress)) {
    const action = await reconcileStaleActiveRunProgress(
      gatewayUrl,
      apiKey,
      progress,
      knownRunIds,
    );
    if (action === 'clear') {
      return 'clear';
    }
  }

  if (frozenMs == null || frozenMs < 5 * 60_000) {
    return 'keep';
  }

  const runId = progress?.runId?.trim();
  if (runId) {
    try {
      const status = await getRunStatus(gatewayUrl, runId, apiKey);
      if (!status || isTerminalGatewayRunStatus(status.status)) {
        return 'clear';
      }
    } catch {
      return 'keep';
    }
    return 'keep';
  }

  const live = await filterLiveGatewayRunIds(gatewayUrl, apiKey, knownRunIds);
  return live.length === 0 ? 'clear' : 'keep';
}

export async function releaseMacOperatorSlot(
  gatewayUrl: string,
  apiKey: string | null | undefined,
  runIds: readonly string[],
): Promise<{ stoppedLiveRuns: number }> {
  const live = await filterLiveGatewayRunIds(gatewayUrl, apiKey, runIds);
  for (const runId of live) {
    try {
      await stopRun(gatewayUrl, runId, apiKey);
    } catch {
      // best effort — Mac may already be idle
    }
  }
  if (live.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, SESSION_RECOVERY_DELAY_MS));
  }
  return { stoppedLiveRuns: live.length };
}

export async function retryOnSessionInUse<T>(
  gatewayUrl: string,
  apiKey: string | null | undefined,
  getRunIds: () => string[],
  fn: () => Promise<T>,
  onWaiting?: (context: SessionInUseWaitContext) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < SESSION_IN_USE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isSessionInUseError(error) || attempt >= SESSION_IN_USE_MAX_ATTEMPTS - 1) {
        throw error;
      }
      const runIds = getRunIds();
      const liveBeforeStop = await filterLiveGatewayRunIds(gatewayUrl, apiKey, runIds);
      onWaiting?.({ hasLiveRun: liveBeforeStop.length > 0 });
      await releaseMacOperatorSlot(gatewayUrl, apiKey, runIds);
      await new Promise((resolve) => setTimeout(resolve, SESSION_IN_USE_RETRY_DELAY_MS));
    }
  }
  throw lastError;
}
