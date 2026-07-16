/**
 * How often ChatScreen refreshes session token/model usage while a run is live.
 * 500ms was measurable JS+network churn; 2s is still "alive" without thrashing the UI.
 */
export const SESSION_USAGE_POLL_MS = 2_000;

/** Minimum allowed poll interval (guards accidental regressions in tests/call sites). */
export const SESSION_USAGE_POLL_MIN_MS = 1_500;

export function resolveSessionUsagePollMs(requestedMs: number = SESSION_USAGE_POLL_MS): number {
  if (!Number.isFinite(requestedMs) || requestedMs < SESSION_USAGE_POLL_MIN_MS) {
    return SESSION_USAGE_POLL_MS;
  }
  return requestedMs;
}
