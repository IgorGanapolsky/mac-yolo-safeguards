import {
  RUN_PROGRESS_ELAPSED_MIN_WIDTH,
  RUN_PROGRESS_STATS_MIN_HEIGHT,
  RUN_PROGRESS_TOKEN_DEBOUNCE_MS,
  resolveRunProgressDetailsExpanded,
  shouldHideProjectChipWhileKeyboard,
  shouldSuppressCommandCenterRunTile,
  shouldUpdateDebouncedTokenLabel,
} from '../utils/runProgressLayout';

describe('runProgressLayout', () => {
  it('suppresses the top RUN tile when the composer banner is visible', () => {
    expect(shouldSuppressCommandCenterRunTile(true)).toBe(true);
    expect(shouldSuppressCommandCenterRunTile(false)).toBe(false);
  });

  it('collapses details by default while the keyboard is open', () => {
    expect(
      resolveRunProgressDetailsExpanded({ keyboardOpen: true, userOverride: null }),
    ).toBe(false);
    expect(
      resolveRunProgressDetailsExpanded({ keyboardOpen: false, userOverride: null }),
    ).toBe(true);
  });

  it('respects an explicit user expand/collapse override', () => {
    expect(
      resolveRunProgressDetailsExpanded({ keyboardOpen: true, userOverride: true }),
    ).toBe(true);
    expect(
      resolveRunProgressDetailsExpanded({ keyboardOpen: false, userOverride: false }),
    ).toBe(false);
  });

  it('debounces token label updates mid-stream', () => {
    expect(
      shouldUpdateDebouncedTokenLabel({
        lastUpdateAtMs: 1000,
        nowMs: 1500,
        prevLabel: 'In: 1 | Out: 0',
        nextLabel: 'In: 2 | Out: 0',
      }),
    ).toBe(false);

    expect(
      shouldUpdateDebouncedTokenLabel({
        lastUpdateAtMs: 1000,
        nowMs: 1000 + RUN_PROGRESS_TOKEN_DEBOUNCE_MS,
        prevLabel: 'In: 1 | Out: 0',
        nextLabel: 'In: 2 | Out: 0',
      }),
    ).toBe(true);
  });

  it('applies the first token label and clears immediately', () => {
    expect(
      shouldUpdateDebouncedTokenLabel({
        lastUpdateAtMs: 0,
        nowMs: 10,
        prevLabel: '',
        nextLabel: 'In: 1 | Out: 0',
      }),
    ).toBe(true);
    expect(
      shouldUpdateDebouncedTokenLabel({
        lastUpdateAtMs: 1000,
        nowMs: 1010,
        prevLabel: 'In: 1 | Out: 0',
        nextLabel: '',
      }),
    ).toBe(true);
  });

  it('hides the project chip while the keyboard is open', () => {
    expect(shouldHideProjectChipWhileKeyboard(true)).toBe(true);
    expect(shouldHideProjectChipWhileKeyboard(false)).toBe(false);
  });

  it('exports reserved layout constants used by the banner styles', () => {
    expect(RUN_PROGRESS_ELAPSED_MIN_WIDTH).toBeGreaterThanOrEqual(56);
    expect(RUN_PROGRESS_STATS_MIN_HEIGHT).toBeGreaterThanOrEqual(36);
  });
});
