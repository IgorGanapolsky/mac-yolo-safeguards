/** Whether the chat list is scrolled near the latest messages (bottom). */
export function isChatNearBottom(
  layoutHeight: number,
  contentOffsetY: number,
  contentHeight: number,
  threshold = 120,
): boolean {
  if (contentHeight <= layoutHeight) {
    return true;
  }
  const distanceFromBottom = contentHeight - layoutHeight - contentOffsetY;
  return distanceFromBottom <= threshold;
}

/** Pull-to-refresh only engages when the user has scrolled to older messages at the top. */
export function isChatAtTop(contentOffsetY: number, threshold = 12): boolean {
  return contentOffsetY <= threshold;
}
