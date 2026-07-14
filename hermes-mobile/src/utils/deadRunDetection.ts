/** No transcript change for this long while client still looks busy → dead-run hint. */
export const DEAD_RUN_TRANSCRIPT_STALE_MS = 3 * 60 * 1000;

export const DEAD_RUN_ENDED_DETAIL = 'Run ended — tap Start fresh or resend';

export function isDeadRunEndedMessage(detail: string | null | undefined): boolean {
  return (detail ?? '').trim() === DEAD_RUN_ENDED_DETAIL;
}

export function transcriptUnchangedMs(
  lastChangeAtMs: number | null | undefined,
  nowMs = Date.now(),
): number {
  if (lastChangeAtMs == null || !Number.isFinite(lastChangeAtMs)) {
    return 0;
  }
  return Math.max(0, nowMs - lastChangeAtMs);
}

/**
 * Surface when HTTP polling keeps returning the same transcript, the gateway
 * reports no live operator run, and no Obsidian agents are active.
 */
/** Mirrors ChatInputBar sendDisabled — must all be false after dead-run unlock. */
export function isComposerSendDisabled(input: {
  isSending: boolean;
  queuedOutboundCount: number;
  outboundStillPending: boolean;
}): boolean {
  return (
    input.isSending || input.queuedOutboundCount > 0 || input.outboundStillPending
  );
}

export function shouldSurfaceDeadRunEnded(input: {
  clientBusy: boolean;
  transcriptUnchangedMs: number;
  activeAgentCount: number;
  gatewayHasLiveRun: boolean;
}): boolean {
  if (!input.clientBusy) {
    return false;
  }
  if (input.transcriptUnchangedMs < DEAD_RUN_TRANSCRIPT_STALE_MS) {
    return false;
  }
  if (input.activeAgentCount > 0) {
    return false;
  }
  if (input.gatewayHasLiveRun) {
    return false;
  }
  return true;
}
