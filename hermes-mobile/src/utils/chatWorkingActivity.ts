/**
 * When Hermes is still working on a reply (send in flight, awaiting Mac, active run,
 * or empty-stream auto-check), show a top pulse/progress — not "stalled" or "open Leash".
 */

export type RunProgressPhaseLike = {
  phase?: string | null;
} | null | undefined;

const ACTIVE_RUN_PHASES = new Set([
  'starting',
  'running',
  'streaming',
  'tools',
  'tool',
  'thinking',
  'waiting',
  'delivering',
]);

export function isActiveRunProgressPhase(phase: string | null | undefined): boolean {
  if (!phase) {
    return false;
  }
  const p = phase.toLowerCase().trim();
  if (ACTIVE_RUN_PHASES.has(p)) {
    return true;
  }
  // Common gateway phases
  return p.includes('run') && !p.includes('fail') && !p.includes('complete');
}

export function isChatWorkingActivity(input: {
  isSending?: boolean;
  awaitingGatewayReply?: boolean;
  /** Empty-stream banner still auto-checking (not hard-stopped). */
  emptyStreamAutoChecking?: boolean;
  runProgress?: RunProgressPhaseLike;
}): boolean {
  if (input.isSending || input.awaitingGatewayReply || input.emptyStreamAutoChecking) {
    return true;
  }
  return isActiveRunProgressPhase(input.runProgress?.phase ?? null);
}
