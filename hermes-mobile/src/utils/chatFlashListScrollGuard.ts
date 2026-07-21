/**
 * Break FlashList contentSize ↔ scrollToEnd feedback that surfaces as
 * ErrorBoundary "Maximum update depth exceeded" (stack at FlashList).
 *
 * ChatScreen stays mounted under other tabs; pair/hydrate can remeasure the
 * list while Settings is visible and previously re-entered scroll → measure →
 * setState in a tight loop.
 */

export type FlashListScrollGuardState = {
  /** True while a programmatic scrollToEnd/scrollToOffset is in flight. */
  programmaticScrollInFlight: boolean;
  /** Monotonic generation bumped when a user drag cancels programmatic follow. */
  scrollCancelGeneration: number;
};

export function createFlashListScrollGuardState(): FlashListScrollGuardState {
  return {
    programmaticScrollInFlight: false,
    scrollCancelGeneration: 0,
  };
}

/** Should onContentSizeChange run scroll/follow logic? */
export function shouldHandleContentSizeChange(
  state: FlashListScrollGuardState,
): boolean {
  return !state.programmaticScrollInFlight;
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
