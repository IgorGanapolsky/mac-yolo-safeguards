/** Background Tailscale discovery must not re-fire on every health tick. */
export const TAILSCALE_BACKGROUND_PROBE_MIN_INTERVAL_MS = 30_000;

export type ProbeTailscaleComputersOptions = {
  /**
   * When false, update discoveries without flipping Find-computers / picker
   * "searching" UI. Default true for user-initiated probes.
   */
  showUi?: boolean;
  /**
   * When false, skip if a probe ran within the background min interval.
   * Default true for explicit Find computers / modal open.
   */
  force?: boolean;
};

export function shouldRunBackgroundTailscaleProbe(input: {
  lastAtMs: number;
  nowMs: number;
  minIntervalMs?: number;
}): boolean {
  const minIntervalMs = input.minIntervalMs ?? TAILSCALE_BACKGROUND_PROBE_MIN_INTERVAL_MS;
  if (input.lastAtMs <= 0) {
    return true;
  }
  return input.nowMs - input.lastAtMs >= minIntervalMs;
}
