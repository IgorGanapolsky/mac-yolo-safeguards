/**
 * Break FlashList contentSize ↔ scrollToEnd feedback that surfaces as
 * ErrorBoundary "Maximum update depth exceeded" (stack at FlashList).
 *
 * ChatScreen stays mounted under other tabs; pair/hydrate/keyboard can remeasure
 * the list and previously re-entered scroll → measure → setState in a tight loop.
 *
 * Hard rules:
 * - never call setState synchronously from onContentSizeChange
 * - defer scroll/follow work off the layout pass (setTimeout 0, not queueMicrotask)
 * - ignore scroll events while a programmatic scroll (or quiet window) is active
 * - ratchet the quiet window when layout storms keep firing during quiet
 */

export type FlashListScrollGuardState = {
  /** True while a programmatic scrollToEnd/scrollToOffset is in flight. */
  programmaticScrollInFlight: boolean;
  /** Monotonic generation bumped when a user drag cancels programmatic follow. */
  scrollCancelGeneration: number;
  /** Date.now() deadline: ignore layout/scroll-driven follow until then. */
  layoutQuietUntilMs: number;
};

/**
 * Hold the quiet window after programmatic scroll settles (layout + onScroll).
 * 280ms covers large-thread hydrate + keyboard inset remounts that outlive #676's
 * double-rAF and #697's 120ms window (device still crashed on OTA ee560d95).
 */
export const FLASHLIST_LAYOUT_QUIET_MS = 280;

/** Extra quiet added when contentSizeChange fires while already quiet (hydrate storm). */
export const FLASHLIST_LAYOUT_QUIET_RATCHET_MS = 160;

export function createFlashListScrollGuardState(): FlashListScrollGuardState {
  return {
    programmaticScrollInFlight: false,
    scrollCancelGeneration: 0,
    layoutQuietUntilMs: 0,
  };
}

/** Should onContentSizeChange run scroll/follow logic? */
export function shouldHandleContentSizeChange(
  state: FlashListScrollGuardState,
  nowMs: number = Date.now(),
): boolean {
  if (state.programmaticScrollInFlight) {
    return false;
  }
  return nowMs >= state.layoutQuietUntilMs;
}

/** Should onScroll update near-bottom React state? */
export function shouldHandleScrollStateUpdate(
  state: FlashListScrollGuardState,
  nowMs: number = Date.now(),
): boolean {
  return shouldHandleContentSizeChange(state, nowMs);
}

/** Mark the start of a programmatic scroll driven by us (not the user). */
export function beginProgrammaticScroll(
  state: FlashListScrollGuardState,
): FlashListScrollGuardState {
  return { ...state, programmaticScrollInFlight: true };
}

/** Clear the in-flight flag and open a short quiet window after layout settles. */
export function endProgrammaticScroll(
  state: FlashListScrollGuardState,
  nowMs: number = Date.now(),
  quietMs: number = FLASHLIST_LAYOUT_QUIET_MS,
): FlashListScrollGuardState {
  return {
    ...state,
    programmaticScrollInFlight: false,
    layoutQuietUntilMs: nowMs + quietMs,
  };
}

/**
 * When layout keeps firing during an active quiet window, push the deadline out
 * so hydrate storms cannot drain the quiet window and re-enter scroll→measure.
 */
export function ratchetLayoutQuietWindow(
  state: FlashListScrollGuardState,
  nowMs: number = Date.now(),
  ratchetMs: number = FLASHLIST_LAYOUT_QUIET_RATCHET_MS,
): FlashListScrollGuardState {
  if (state.programmaticScrollInFlight || nowMs < state.layoutQuietUntilMs) {
    const floor = Math.max(state.layoutQuietUntilMs, nowMs);
    return { ...state, layoutQuietUntilMs: floor + ratchetMs };
  }
  return state;
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

/**
 * Pure model of the crash class: contentSize → scroll → contentSize must not
 * keep scheduling follow work while the guard is active.
 */
export function simulateContentSizeScrollLoop(
  iterations: number,
  quietMs: number = FLASHLIST_LAYOUT_QUIET_MS,
): { followScheduled: number; finalQuietUntilMs: number } {
  let state = createFlashListScrollGuardState();
  let followScheduled = 0;
  let now = 1_000;
  for (let i = 0; i < iterations; i += 1) {
    if (!shouldHandleContentSizeChange(state, now)) {
      state = ratchetLayoutQuietWindow(state, now);
      now += 1;
      continue;
    }
    followScheduled += 1;
    state = beginProgrammaticScroll(state);
    state = endProgrammaticScroll(state, now, quietMs);
    now += 1;
  }
  return { followScheduled, finalQuietUntilMs: state.layoutQuietUntilMs };
}
