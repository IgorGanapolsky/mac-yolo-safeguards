import {
  FLASHLIST_LAYOUT_QUIET_MS,
  beginProgrammaticScroll,
  createFlashListScrollGuardState,
  endProgrammaticScroll,
  nextChatNearBottom,
  shouldHandleContentSizeChange,
  shouldHandleScrollStateUpdate,
} from '../utils/chatFlashListScrollGuard';

describe('chatFlashListScrollGuard', () => {
  it('blocks contentSize handlers while a programmatic scroll is in flight', () => {
    let state = createFlashListScrollGuardState();
    expect(shouldHandleContentSizeChange(state, 1_000)).toBe(true);

    state = beginProgrammaticScroll(state);
    expect(shouldHandleContentSizeChange(state, 1_000)).toBe(false);

    state = endProgrammaticScroll(state, 1_000, FLASHLIST_LAYOUT_QUIET_MS);
    // Quiet window still blocks layout-driven follow immediately after scroll.
    expect(shouldHandleContentSizeChange(state, 1_000)).toBe(false);
    expect(
      shouldHandleContentSizeChange(state, 1_000 + FLASHLIST_LAYOUT_QUIET_MS),
    ).toBe(true);
  });

  it('blocks onScroll near-bottom setState during quiet window', () => {
    let state = createFlashListScrollGuardState();
    state = beginProgrammaticScroll(state);
    state = endProgrammaticScroll(state, 5_000, 120);
    expect(shouldHandleScrollStateUpdate(state, 5_050)).toBe(false);
    expect(shouldHandleScrollStateUpdate(state, 5_120)).toBe(true);
  });

  it('no-ops near-bottom setState when the value is unchanged', () => {
    expect(nextChatNearBottom(true, true)).toBe(true);
    expect(nextChatNearBottom(false, false)).toBe(false);
    expect(nextChatNearBottom(false, true)).toBe(true);
    expect(nextChatNearBottom(true, false)).toBe(false);
  });
});
