import {
  FLASHLIST_LAYOUT_QUIET_MS,
  FLASHLIST_LAYOUT_QUIET_RATCHET_MS,
  beginProgrammaticScroll,
  createFlashListScrollGuardState,
  endProgrammaticScroll,
  ratchetLayoutQuietWindow,
  shouldHandleContentSizeChange,
  shouldHandleScrollStateUpdate,
  simulateContentSizeScrollLoop,
} from '../utils/chatFlashListScrollGuard';

// Extra hardening coverage for the recurring FlashList "Maximum update depth
// exceeded" crash (#676/#697/#717). chatFlashListScrollGuard.test.ts covers the
// primary state-machine cases and is owned by an in-progress plan.md task; this
// file adds the branches/scale that keep tripping the recurrence — kept separate
// so it never collides with that claim. Locked to 100% coverage in jest.config.js.
describe('chatFlashListScrollGuard hardening', () => {
  it('stays bounded across a large hydrate storm, not just a handful of events', () => {
    // A real device hydrate storm fires far more than a dozen layout events;
    // this proves the guard does not degrade into unbounded follow scheduling
    // at scale — the exact shape that kept crashing the device after #676/#697.
    const { followScheduled } = simulateContentSizeScrollLoop(5_000);
    expect(followScheduled).toBe(1);
  });

  it('does not ratchet once the quiet window has already elapsed and no scroll is in flight', () => {
    let state = createFlashListScrollGuardState();
    state = endProgrammaticScroll(state, 20_000, 100);
    const settled = ratchetLayoutQuietWindow(state, 20_500);
    expect(settled).toBe(state); // no-op: same reference, no wasted setState
  });

  it('still ratchets while a programmatic scroll is in flight even past the old deadline', () => {
    let state = createFlashListScrollGuardState();
    state = endProgrammaticScroll(state, 20_000, 100);
    state = beginProgrammaticScroll(state);
    const ratcheted = ratchetLayoutQuietWindow(state, 20_500, 50);
    expect(ratcheted.layoutQuietUntilMs).toBe(20_550);
  });

  it('applies the documented default quiet/ratchet windows when callers omit them', () => {
    let state = createFlashListScrollGuardState();
    state = endProgrammaticScroll(state, 30_000);
    expect(state.layoutQuietUntilMs).toBe(30_000 + FLASHLIST_LAYOUT_QUIET_MS);

    state = ratchetLayoutQuietWindow(state, 30_000);
    expect(state.layoutQuietUntilMs).toBe(
      30_000 + FLASHLIST_LAYOUT_QUIET_MS + FLASHLIST_LAYOUT_QUIET_RATCHET_MS,
    );
  });

  it('falls back to Date.now() when callers omit the nowMs arg entirely', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(50_000);
    try {
      let state = createFlashListScrollGuardState();
      expect(typeof shouldHandleContentSizeChange(state)).toBe('boolean');
      expect(typeof shouldHandleScrollStateUpdate(state)).toBe('boolean');

      state = beginProgrammaticScroll(state);
      state = endProgrammaticScroll(state);
      expect(state.layoutQuietUntilMs).toBe(50_000 + FLASHLIST_LAYOUT_QUIET_MS);

      const ratcheted = ratchetLayoutQuietWindow({
        ...state,
        programmaticScrollInFlight: true,
      });
      expect(ratcheted.layoutQuietUntilMs).toBe(
        50_000 + FLASHLIST_LAYOUT_QUIET_MS + FLASHLIST_LAYOUT_QUIET_RATCHET_MS,
      );
    } finally {
      nowSpy.mockRestore();
    }
  });
});
