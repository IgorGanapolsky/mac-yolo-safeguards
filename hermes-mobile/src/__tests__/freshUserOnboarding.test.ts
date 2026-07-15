import {
  freshUserConnectionBody,
  freshUserOnboardingSteps,
  hasValidSavedComputer,
  isFreshUserUnpaired,
  isOnTailscaleRoute,
  shouldHideConnectionStatusChips,
  shouldShowFreshUserOnboardingSteps,
} from '../utils/freshUserOnboarding';
import {
  CONNECTION_HEAL_DURATION_MS,
  connectionHealSnapshot,
} from '../utils/connectionErrorPolicy';

describe('freshUserOnboarding', () => {
  it('treats empty profiles as fresh user unpaired', () => {
    expect(isFreshUserUnpaired([])).toBe(true);
    expect(hasValidSavedComputer([])).toBe(false);
  });

  it('shows numbered steps immediately for fresh users', () => {
    const heal = connectionHealSnapshot(0, true);
    expect(shouldShowFreshUserOnboardingSteps({ profiles: [], heal })).toBe(true);
  });

  it('waits for heal exhaustion before steps for returning users', () => {
    const profiles = [
      {
        id: 'mac',
        label: 'Mac mini',
        gatewayUrl: 'http://192.168.1.50:8642',
        addedAt: '2026-06-28T00:00:00Z',
      },
    ];
    expect(
      shouldShowFreshUserOnboardingSteps({
        profiles,
        heal: connectionHealSnapshot(2, true),
      }),
    ).toBe(false);
    expect(
      shouldShowFreshUserOnboardingSteps({
        profiles,
        heal: connectionHealSnapshot(6, false),
      }),
    ).toBe(true);
  });

  it('hides status chips during silent heal for saved profiles', () => {
    const profiles = [
      {
        id: 'mac',
        label: 'Mac mini',
        gatewayUrl: 'http://192.168.1.50:8642',
        addedAt: '2026-06-28T00:00:00Z',
      },
    ];
    expect(
      shouldHideConnectionStatusChips({
        profiles,
        heal: connectionHealSnapshot(2, true),
      }),
    ).toBe(true);
    expect(
      shouldHideConnectionStatusChips({
        profiles,
        heal: connectionHealSnapshot(6, false),
      }),
    ).toBe(false);
  });

  it('documents plain-language onboarding steps without gateway or relay jargon', () => {
    const joined = freshUserOnboardingSteps({ tailscaleMacLabel: 'Igors-Mac-mini' })
      .map((step) => `${step.title} ${step.body}`)
      .join(' ');
    expect(joined).toContain('Find computers');
    expect(joined).toContain('Igors-Mac-mini');
    expect(joined.toLowerCase()).not.toContain('relay');
    expect(joined.toLowerCase()).not.toContain('gateway');
    expect(joined.toLowerCase()).not.toContain('lan');
  });

  it('uses Tailscale-first steps when the saved route is Tailscale (not home Wi‑Fi)', () => {
    const profiles = [
      {
        id: 'mini',
        label: 'Igors-Mac-mini',
        gatewayUrl: 'http://100.94.135.78:8642',
        addedAt: '2026-06-28T00:00:00Z',
      },
    ];
    expect(isOnTailscaleRoute(profiles, 'mini')).toBe(true);
    const steps = freshUserOnboardingSteps({
      tailscaleMacLabel: 'Igors-Mac-mini',
      onTailscaleRoute: true,
    });
    expect(steps[0]?.title).toBe('Tailscale connected');
    expect(steps.map((step) => step.title).join(' ')).not.toContain('Same home Wi‑Fi');
    expect(steps[2]?.body).toContain('Tailscale network');
  });

  it('uses cellular Tailscale steps instead of home Wi‑Fi on cellular', () => {
    const steps = freshUserOnboardingSteps({
      tailscaleMacLabel: 'Igors-Mac-mini',
      cellularBlocksDirect: true,
    });
    expect(steps[0]?.title).toBe('Use Tailscale from cellular');
    expect(steps.map((step) => step.title).join(' ')).not.toContain('Same home Wi‑Fi');
    expect(steps[2]?.body).toContain('Tailscale network');
  });

  it('searches Tailscale network copy when probing on a Tailscale route', () => {
    const body = freshUserConnectionBody({
      searching: true,
      healInFlight: false,
      healExhausted: true,
      freshUser: false,
      macLabel: 'Igors-Mac-mini',
      cellularBlocksDirect: false,
      showUsbFix: false,
      onTailscaleRoute: true,
    });
    expect(body).toContain('Tailscale network');
    expect(body).not.toContain('home Wi‑Fi');
  });

  it('uses silent heal duration of about 30 seconds', () => {
    expect(CONNECTION_HEAL_DURATION_MS).toBe(30_000);
  });

  it('explains automatic heal before human copy for returning users', () => {
    const body = freshUserConnectionBody({
      searching: false,
      healInFlight: true,
      healExhausted: false,
      healAttempt: 3,
      freshUser: false,
      macLabel: 'Mac mini',
      cellularBlocksDirect: false,
      showUsbFix: false,
    });
    expect(body).toContain('automatically');
    expect(body).toContain('Mac mini');
    expect(body).toContain('(3 of 6)');
  });
});
