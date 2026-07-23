/** Minimum touch target (pt) for Restart / dismiss — Apple HIG / Material. */
export const OTA_BANNER_MIN_TAP_PT = 44;

/** Extra content padding below the status-bar inset. */
export const OTA_BANNER_CONTENT_PAD_TOP = 10;

/**
 * Top padding so the Update-ready banner never draws under the status bar /
 * cutout. Always place interactive Restart / dismiss *below* `safeAreaTop`.
 */
export function otaBannerTopPadding(safeAreaTop: number): number {
  const top = Number.isFinite(safeAreaTop) ? Math.max(0, safeAreaTop) : 0;
  return top + OTA_BANNER_CONTENT_PAD_TOP;
}

export function otaBannerActionMinSize(): number {
  return OTA_BANNER_MIN_TAP_PT;
}
