/** Minimum touch target (pt) for Restart / dismiss — Apple HIG / Material. */
export const OTA_BANNER_MIN_TAP_PT = 44;

/** Extra content padding below the status-bar inset. */
export const OTA_BANNER_CONTENT_PAD_TOP = 10;

/**
 * Android edge-to-edge often reports `insets.top === 0` for views mounted
 * outside a screen SafeAreaView. Fall back to StatusBar height / 24dp floor
 * so Restart/X never sit under the system status icons.
 */
export function otaBannerTopPadding(
  safeAreaTop: number,
  statusBarHeight: number = 0,
): number {
  const inset = Number.isFinite(safeAreaTop) ? Math.max(0, safeAreaTop) : 0;
  const status = Number.isFinite(statusBarHeight) ? Math.max(0, statusBarHeight) : 0;
  const top = Math.max(inset, status, inset === 0 && status === 0 ? 24 : 0);
  return top + OTA_BANNER_CONTENT_PAD_TOP;
}

export function otaBannerActionMinSize(): number {
  return OTA_BANNER_MIN_TAP_PT;
}
