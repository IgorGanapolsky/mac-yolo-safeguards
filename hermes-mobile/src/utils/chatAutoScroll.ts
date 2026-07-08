/** Pixels from the visual bottom of the chat list. */
export function chatDistanceFromBottom(
  layoutHeight: number,
  contentOffsetY: number,
  contentHeight: number,
): number {
  if (contentHeight <= layoutHeight) {
    return 0;
  }
  return contentHeight - layoutHeight - contentOffsetY;
}

/**
 * Whether the transcript should follow new content.
 *
 * During streaming, content growth can temporarily push the viewport away from
 * the bottom without the user scrolling — keep following unless they explicitly
 * scrolled up. Outside streaming, only follow when already near the bottom.
 */
export function shouldAutoScroll(
  distanceFromBottom: number,
  isStreaming: boolean,
  userScrolledUp: boolean,
  threshold = 120,
): boolean {
  if (userScrolledUp) {
    return false;
  }
  if (isStreaming) {
    return true;
  }
  return distanceFromBottom <= threshold;
}

/** Cancel a scheduled bottom scroll only when the user detached on purpose. */
export function shouldCancelPendingScroll(params: {
  userScrolledUp: boolean;
  wasFollowing: boolean;
  nearBottom: boolean;
}): boolean {
  return params.userScrolledUp && params.wasFollowing && !params.nearBottom;
}

/** Mark explicit user scroll-up; clear when they return near the bottom. */
export function resolveUserScrolledUp(params: {
  nearBottom: boolean;
  userDragging: boolean;
  prevUserScrolledUp: boolean;
}): boolean {
  if (params.nearBottom) {
    return false;
  }
  if (params.userDragging) {
    return true;
  }
  return params.prevUserScrolledUp;
}
