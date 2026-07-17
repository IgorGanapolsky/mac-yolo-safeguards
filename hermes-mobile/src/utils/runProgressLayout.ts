/**
 * Layout stability helpers for the chat RUN banner / command-center chrome.
 * Prevents height thrash when the timer ticks, tokens update, or the keyboard opens.
 */

/** Fixed width for elapsed label so "9s" → "15s" → "1m 04s" does not reflow the header row. */
export const RUN_PROGRESS_ELAPSED_MIN_WIDTH = 64;

/** Reserved height for the MODEL/TOKENS row while details are expanded. */
export const RUN_PROGRESS_STATS_MIN_HEIGHT = 40;

/** Min interval before token count text may change the laid-out string. */
export const RUN_PROGRESS_TOKEN_DEBOUNCE_MS = 2000;

/**
 * Composer already hosts RunProgressBanner — hide the duplicate top RUN tile
 * so the FlashList viewport does not lose another ~50–80px on every active run.
 */
export function shouldSuppressCommandCenterRunTile(composerBannerVisible: boolean): boolean {
  return composerBannerVisible;
}

/**
 * Default expand/collapse for run details.
 * - Explicit user preference (toggle / AsyncStorage) always wins.
 * - Keyboard open → collapse when no preference yet.
 * - Keyboard closed → expand when no preference yet.
 * Never clear a collapse preference on timer/token/tool ticks or keyboard flicker.
 */
export function resolveRunProgressDetailsExpanded(params: {
  keyboardOpen: boolean;
  userOverride: boolean | null;
}): boolean {
  if (params.userOverride != null) {
    return params.userOverride;
  }
  return !params.keyboardOpen;
}

/**
 * Whether the visible token summary string should update.
 * First paint and label clears always apply; otherwise debounce mid-stream churn.
 */
export function shouldUpdateDebouncedTokenLabel(params: {
  lastUpdateAtMs: number;
  nowMs: number;
  prevLabel: string;
  nextLabel: string;
  minIntervalMs?: number;
}): boolean {
  const { lastUpdateAtMs, nowMs, prevLabel, nextLabel } = params;
  const minIntervalMs = params.minIntervalMs ?? RUN_PROGRESS_TOKEN_DEBOUNCE_MS;
  if (prevLabel === nextLabel) {
    return false;
  }
  if (!prevLabel || !nextLabel) {
    return true;
  }
  return nowMs - lastUpdateAtMs >= minIntervalMs;
}

/** Hide the vault project chip while the IME is open to protect transcript height. */
export function shouldHideProjectChipWhileKeyboard(keyboardOpen: boolean): boolean {
  return keyboardOpen;
}
