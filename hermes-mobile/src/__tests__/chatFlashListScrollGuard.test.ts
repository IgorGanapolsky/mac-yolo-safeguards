import {
  allowContentSizeScroll,
  beginProgrammaticScroll,
  CONTENT_SIZE_SCROLL_COOLDOWN_MS,
  CONTENT_SIZE_SCROLL_MAX_HITS,
  createContentSizeScrollCircuit,
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

  it('opens a circuit breaker after too many contentSize scroll hits', () => {
    const circuit = createContentSizeScrollCircuit();
    const t0 = 1_000_000;
    for (let i = 0; i < CONTENT_SIZE_SCROLL_MAX_HITS; i += 1) {
      expect(allowContentSizeScroll(circuit, t0 + i)).toBe(true);
    }
    const tripAt = t0 + CONTENT_SIZE_SCROLL_MAX_HITS;
    expect(allowContentSizeScroll(circuit, tripAt)).toBe(false);
    expect(
      allowContentSizeScroll(circuit, tripAt + CONTENT_SIZE_SCROLL_COOLDOWN_MS - 1),
    ).toBe(false);
    expect(
      allowContentSizeScroll(circuit, tripAt + CONTENT_SIZE_SCROLL_COOLDOWN_MS + 1),
    ).toBe(true);
  });
});
