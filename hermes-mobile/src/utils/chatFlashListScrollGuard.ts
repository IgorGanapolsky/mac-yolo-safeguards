/**
 * Break FlashList contentSize ↔ scrollToEnd feedback that surfaces as
 * ErrorBoundary "Maximum update depth exceeded" (stack at FlashList).
 *
 * ChatScreen stays mounted under other tabs; pair/hydrate/keyboard can remeasure
 * the list and previously re-entered scroll → measure → setState in a tight loop.
 *
 * Hard rule: never call setState synchronously from onContentSizeChange.
 * Defer scroll/follow work off the layout pass, and ignore scroll events while
 * a programmatic scroll (or its short quiet window) is active.
 */

export type FlashListScrollGuardState = {
  /** True while a programmatic scrollToEnd/scrollToOffset is in flight. */
  programmaticScrollInFlight: boolean;
  /** Monotonic generation bumped when a user drag cancels programmatic follow. */
  scrollCancelGeneration: number;
  /** Date.now() deadline: ignore layout/scroll-driven follow until then. */
  layoutQuietUntilMs: number;
};

/** Hold the quiet window after programmatic scroll settles (layout + onScroll). */
export const FLASHLIST_LAYOUT_QUIET_MS = 120;

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
 * Prefer functional setState that no-ops when already near bottom so
 * onContentSizeChange cannot schedule a re-render for a redundant true→true.
 */
export function nextChatNearBottom(
  prev: boolean,
  nearBottom: boolean,
): boolean {
  return prev === nearBottom ? prev : nearBottom;
}
