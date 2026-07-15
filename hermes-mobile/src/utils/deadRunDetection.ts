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

/**
 * Surface when HTTP polling keeps returning the same transcript for this
 * session's run and the gateway reports no live operator run for it.
 *
 * Deliberately does NOT gate on global Obsidian agent activity
 * (`/v1/obsidian/agents`): that endpoint reports every agent across the
 * whole vault, unrelated to this specific chat run. Gating on it meant any
 * unrelated scheduled job/automation running elsewhere on the Mac would
 * permanently block dead-run detection for an actually-dead session — the
 * P0 where Send stayed grayed behind "Working on your computer…" forever.
 */
export function shouldSurfaceDeadRunEnded(input: {
  clientBusy: boolean;
  transcriptUnchangedMs: number;
  gatewayHasLiveRun: boolean;
}): boolean {
  if (!input.clientBusy) {
    return false;
  }
  if (input.transcriptUnchangedMs < DEAD_RUN_TRANSCRIPT_STALE_MS) {
    return false;
  }
  if (input.gatewayHasLiveRun) {
    return false;
  }
  return true;
}
