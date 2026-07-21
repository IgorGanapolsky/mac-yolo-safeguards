/**
 * Break FlashList contentSize ↔ scrollToEnd feedback that surfaces as
 * ErrorBoundary "Maximum update depth exceeded" (stack at FlashList).
 *
 * ChatScreen stays mounted under other tabs; pair/hydrate can remeasure the
 * list while Settings is visible and previously re-entered scroll → measure →
 * setState in a tight loop. Tip OTA ee560d95 proved programmaticScrollInFlight
 * alone is not enough — also rate-limit contentSize→scroll and never setState
 * from onContentSizeChange.
 */

export type FlashListScrollGuardState = {
  /** True while a programmatic scrollToEnd/scrollToOffset is in flight. */
  programmaticScrollInFlight: boolean;
  /** Monotonic generation bumped when a user drag cancels programmatic follow. */
  scrollCancelGeneration: number;
};

/** Sliding-window circuit breaker for onContentSizeChange → scroll. */
export type ContentSizeScrollCircuit = {
  windowStartMs: number;
  hitsInWindow: number;
  cooledUntilMs: number;
};

export const CONTENT_SIZE_SCROLL_WINDOW_MS = 250;
export const CONTENT_SIZE_SCROLL_MAX_HITS = 6;
export const CONTENT_SIZE_SCROLL_COOLDOWN_MS = 2000;

export function createFlashListScrollGuardState(): FlashListScrollGuardState {
  return {
    programmaticScrollInFlight: false,
    scrollCancelGeneration: 0,
  };
}

export function createContentSizeScrollCircuit(): ContentSizeScrollCircuit {
  return { windowStartMs: 0, hitsInWindow: 0, cooledUntilMs: 0 };
}

/** Should onContentSizeChange run scroll/follow logic? */
export function shouldHandleContentSizeChange(
  state: FlashListScrollGuardState,
): boolean {
  return !state.programmaticScrollInFlight;
}

/**
 * Record an attempted contentSize→scroll. Returns false when the circuit is
 * open (too many hits in the window) so callers must skip scroll/setState.
 */
export function allowContentSizeScroll(
  circuit: ContentSizeScrollCircuit,
  nowMs: number,
): boolean {
  if (nowMs < circuit.cooledUntilMs) {
    return false;
  }
  if (
    circuit.windowStartMs === 0 ||
    nowMs - circuit.windowStartMs > CONTENT_SIZE_SCROLL_WINDOW_MS
  ) {
    circuit.windowStartMs = nowMs;
    circuit.hitsInWindow = 1;
    return true;
  }
  circuit.hitsInWindow += 1;
  if (circuit.hitsInWindow > CONTENT_SIZE_SCROLL_MAX_HITS) {
    circuit.cooledUntilMs = nowMs + CONTENT_SIZE_SCROLL_COOLDOWN_MS;
    return false;
  }
  return true;
}

/** Mark the start of a programmatic scroll driven by us (not the user). */
export function beginProgrammaticScroll(
  state: FlashListScrollGuardState,
): FlashListScrollGuardState {
  return { ...state, programmaticScrollInFlight: true };
}

/** Clear the in-flight flag after layout has settled (next frame / rAF). */
export function endProgrammaticScroll(
  state: FlashListScrollGuardState,
): FlashListScrollGuardState {
  return { ...state, programmaticScrollInFlight: false };
}

/**
 * Prefer functional setState that no-ops when already near bottom so
 * onContentSizeChange cannot schedule a re-render for a redundant true→true.
 */
export function nextChatNearBottom(
  prev: boolean,
  nearBottom: boolean,
): boolean {
  return prev === nearBottom ? prev : nearBottom;
}
