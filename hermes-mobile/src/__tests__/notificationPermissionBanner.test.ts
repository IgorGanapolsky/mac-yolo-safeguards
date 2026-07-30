import {
  NOTIFICATION_BANNER_SNOOZE_MS,
  resolveNotificationPermissionBanner,
  shouldEscalateToSystemSettings,
} from '../utils/notificationPermissionBanner';

const NOW = 1_800_000_000_000;

describe('resolveNotificationPermissionBanner', () => {
  it('stays hidden when notifications are granted', () => {
    expect(
      resolveNotificationPermissionBanner({
        permission: { granted: true, canAskAgain: true },
        dismissal: null,
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it('stays hidden while the permission state is still unknown', () => {
    expect(
      resolveNotificationPermissionBanner({
        permission: null,
        dismissal: null,
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  // The core defect: denied permission silently killed approval alerts with no UI anywhere
  // outside the Settings toggle.
  it('warns on the Leash tab when permission is denied but re-askable', () => {
    const banner = resolveNotificationPermissionBanner({
      permission: { granted: false, canAskAgain: true },
      dismissal: null,
      nowMs: NOW,
    });
    expect(banner).not.toBeNull();
    expect(banner?.variant).toBe('request');
    expect(banner?.ctaLabel).toBe('Turn on alerts');
  });

  // "Tap to allow" is a lie once Android refuses to show the prompt again.
  it('routes to system settings when the OS will not ask again', () => {
    const banner = resolveNotificationPermissionBanner({
      permission: { granted: false, canAskAgain: false },
      dismissal: null,
      nowMs: NOW,
    });
    expect(banner?.variant).toBe('system-settings');
    expect(banner?.ctaLabel).toBe('Open system settings');
    expect(banner?.body).toMatch(/system settings/i);
  });

  it('hides for the snooze window after dismissal', () => {
    expect(
      resolveNotificationPermissionBanner({
        permission: { granted: false, canAskAgain: true },
        dismissal: { variant: 'request', atMs: NOW - 1000 },
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it('returns after the snooze window instead of hiding forever', () => {
    const banner = resolveNotificationPermissionBanner({
      permission: { granted: false, canAskAgain: true },
      dismissal: { variant: 'request', atMs: NOW - NOTIFICATION_BANNER_SNOOZE_MS - 1 },
      nowMs: NOW,
    });
    expect(banner?.variant).toBe('request');
  });

  // A dismissal of "turn on alerts" must not silence the materially different
  // "Android will never ask again, go to settings" message.
  it('ignores a dismissal aimed at the other variant', () => {
    const banner = resolveNotificationPermissionBanner({
      permission: { granted: false, canAskAgain: false },
      dismissal: { variant: 'request', atMs: NOW - 1000 },
      nowMs: NOW,
    });
    expect(banner?.variant).toBe('system-settings');
  });

  it('ignores a future-dated dismissal from clock skew', () => {
    const banner = resolveNotificationPermissionBanner({
      permission: { granted: false, canAskAgain: true },
      dismissal: { variant: 'request', atMs: NOW + 5 * NOTIFICATION_BANNER_SNOOZE_MS },
      nowMs: NOW,
    });
    expect(banner?.variant).toBe('request');
  });

  it('ignores a non-finite stored timestamp', () => {
    const banner = resolveNotificationPermissionBanner({
      permission: { granted: false, canAskAgain: true },
      dismissal: { variant: 'request', atMs: Number.NaN },
      nowMs: NOW,
    });
    expect(banner?.variant).toBe('request');
  });
});

describe('shouldEscalateToSystemSettings', () => {
  it('escalates immediately for the system-settings variant', () => {
    expect(
      shouldEscalateToSystemSettings({
        variant: 'system-settings',
        afterRequest: { granted: false, canAskAgain: true },
      }),
    ).toBe(true);
  });

  it('escalates when the prompt was denied and cannot be shown again', () => {
    expect(
      shouldEscalateToSystemSettings({
        variant: 'request',
        afterRequest: { granted: false, canAskAgain: false },
      }),
    ).toBe(true);
  });

  it('does not escalate when permission was just granted', () => {
    expect(
      shouldEscalateToSystemSettings({
        variant: 'request',
        afterRequest: { granted: true, canAskAgain: false },
      }),
    ).toBe(false);
  });

  it('does not escalate while the OS can still be asked again', () => {
    expect(
      shouldEscalateToSystemSettings({
        variant: 'request',
        afterRequest: { granted: false, canAskAgain: true },
      }),
    ).toBe(false);
  });
});
