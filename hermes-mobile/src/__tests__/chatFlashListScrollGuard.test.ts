import {
  beginProgrammaticScroll,
  createFlashListScrollGuardState,
  endProgrammaticScroll,
  nextChatNearBottom,
  shouldHandleContentSizeChange,
} from '../utils/chatFlashListScrollGuard';

describe('chatFlashListScrollGuard', () => {
  it('blocks contentSize handlers while a programmatic scroll is in flight', () => {
    let state = createFlashListScrollGuardState();
    expect(shouldHandleContentSizeChange(state)).toBe(true);

    state = beginProgrammaticScroll(state);
    expect(shouldHandleContentSizeChange(state)).toBe(false);

    state = endProgrammaticScroll(state);
    expect(shouldHandleContentSizeChange(state)).toBe(true);
  });

  it('no-ops near-bottom setState when the value is unchanged', () => {
    expect(nextChatNearBottom(true, true)).toBe(true);
    expect(nextChatNearBottom(false, false)).toBe(false);
    expect(nextChatNearBottom(false, true)).toBe(true);
    expect(nextChatNearBottom(true, false)).toBe(false);
  });
});
