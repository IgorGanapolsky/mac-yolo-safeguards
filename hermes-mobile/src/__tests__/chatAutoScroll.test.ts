import {
  chatDistanceFromBottom,
  resolveUserScrolledUp,
  shouldAutoScroll,
  shouldCancelPendingScroll,
  shouldRunThrottledStreamScroll,
  STREAM_SCROLL_MIN_INTERVAL_MS,
} from '../utils/chatAutoScroll';

describe('chatAutoScroll', () => {
  it('computes distance from the visual bottom', () => {
    expect(chatDistanceFromBottom(400, 580, 1000)).toBe(20);
    expect(chatDistanceFromBottom(400, 0, 200)).toBe(0);
  });

  it('throttles stream follow-scrolls to avoid jitter', () => {
    expect(shouldRunThrottledStreamScroll(0, 1000)).toBe(true);
    expect(shouldRunThrottledStreamScroll(1000, 1000 + STREAM_SCROLL_MIN_INTERVAL_MS - 1)).toBe(
      false,
    );
    expect(shouldRunThrottledStreamScroll(1000, 1000 + STREAM_SCROLL_MIN_INTERVAL_MS)).toBe(true);
  });

  it('follows streaming output unless the user scrolled up', () => {
    expect(shouldAutoScroll(400, true, false)).toBe(true);
    expect(shouldAutoScroll(400, true, true)).toBe(false);
  });

  it('follows idle updates only when already near the bottom', () => {
    expect(shouldAutoScroll(80, false, false)).toBe(true);
    expect(shouldAutoScroll(200, false, false)).toBe(false);
    expect(shouldAutoScroll(200, false, true)).toBe(false);
  });

  it('cancels pending scroll only after explicit user detach', () => {
    expect(
      shouldCancelPendingScroll({
        userScrolledUp: true,
        wasFollowing: true,
        nearBottom: false,
      }),
    ).toBe(true);
    expect(
      shouldCancelPendingScroll({
        userScrolledUp: false,
        wasFollowing: true,
        nearBottom: false,
      }),
    ).toBe(false);
  });

  it('clears user scroll-up when returning near the bottom', () => {
    expect(
      resolveUserScrolledUp({
        nearBottom: true,
        userDragging: false,
        prevUserScrolledUp: true,
      }),
    ).toBe(false);
    expect(
      resolveUserScrolledUp({
        nearBottom: false,
        userDragging: true,
        prevUserScrolledUp: false,
      }),
    ).toBe(true);
  });
});
