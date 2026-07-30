/**
 * Degraded-capability banner for the Leash tab when POST_NOTIFICATIONS is not granted.
 *
 * Why this exists: approvals are the product. If notification permission is denied the
 * app still looks fully functional — the Leash tab renders, health is green, chat sends —
 * but an approval alert can never reach the lock screen. Before this module the ONLY
 * warning lived behind a Settings toggle (SettingsScreen `ensureNotificationPermission`),
 * so a user who tapped "Don't allow" at first launch and never opened Settings lost the
 * core safety feature silently.
 *
 * Two distinct denied states must read differently:
 *  - canAskAgain === true  -> the OS will still show the prompt, so "turn on" is honest.
 *  - canAskAgain === false -> Android will never show the prompt again. Telling the user
 *    to "tap to allow" would be a lie; the only real path is system settings.
 */

export type NotificationPermissionSnapshot = {
  granted: boolean;
  /** False once Android/iOS refuses to show the OS prompt again. */
  canAskAgain: boolean;
};

/** `request` can still raise the OS prompt; `system-settings` cannot. */
export type NotificationBannerVariant = 'request' | 'system-settings';

export type NotificationBannerDismissal = {
  variant: NotificationBannerVariant;
  atMs: number;
};

export type NotificationBannerState = {
  variant: NotificationBannerVariant;
  title: string;
  body: string;
  ctaLabel: string;
};

/**
 * Re-prompt cadence. Dismissing hides the banner for a day rather than forever: a paid
 * safety app must not let one stray tap permanently hide the fact that alerts are dead,
 * but nagging on every render is equally unacceptable.
 */
export const NOTIFICATION_BANNER_SNOOZE_MS = 24 * 60 * 60 * 1000;

const REQUEST_STATE: NotificationBannerState = {
  variant: 'request',
  title: 'Approval alerts are off',
  body: 'Hermes cannot alert you when an agent is blocked waiting for approval. Runs will sit paused until you open this tab.',
  ctaLabel: 'Turn on alerts',
};

const SYSTEM_SETTINGS_STATE: NotificationBannerState = {
  variant: 'system-settings',
  title: 'Approval alerts are blocked',
  body: 'Notifications are blocked for Hermes, and Android will not ask again. Approval alerts stay off until you enable them in system settings.',
  ctaLabel: 'Open system settings',
};

/**
 * Decide whether the Leash tab shows the degraded-capability banner.
 *
 * @param permission null while the permission state is still unknown (first render, or a
 *   platform with no notification permission model) — the banner stays hidden rather than
 *   flashing a false warning.
 */
export function resolveNotificationPermissionBanner(input: {
  permission: NotificationPermissionSnapshot | null;
  dismissal: NotificationBannerDismissal | null;
  nowMs: number;
}): NotificationBannerState | null {
  const { permission, dismissal, nowMs } = input;

  if (!permission || permission.granted) {
    return null;
  }

  const state = permission.canAskAgain ? REQUEST_STATE : SYSTEM_SETTINGS_STATE;

  if (!dismissal) {
    return state;
  }

  // A dismissal only silences the message it was aimed at. When Android stops offering
  // the prompt the copy changes from "tap to allow" to "open system settings" — a
  // materially different instruction that an older dismissal must not suppress.
  if (dismissal.variant !== state.variant) {
    return state;
  }

  if (!Number.isFinite(dismissal.atMs)) {
    return state;
  }

  // Clock skew / timezone travel can park a stored timestamp in the future. Treat that as
  // untrustworthy and show the banner instead of hiding it until the clock catches up.
  if (dismissal.atMs > nowMs) {
    return state;
  }

  if (nowMs - dismissal.atMs < NOTIFICATION_BANNER_SNOOZE_MS) {
    return null;
  }

  return state;
}

/**
 * After a CTA tap, does the app still need to send the user to system settings?
 * A `request` banner whose OS prompt was denied while `canAskAgain` was already false
 * would otherwise dead-end the user on a button that does nothing visible.
 */
export function shouldEscalateToSystemSettings(input: {
  variant: NotificationBannerVariant;
  afterRequest: NotificationPermissionSnapshot;
}): boolean {
  if (input.variant === 'system-settings') {
    return true;
  }
  return !input.afterRequest.granted && !input.afterRequest.canAskAgain;
}
