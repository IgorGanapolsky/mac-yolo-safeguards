import {
  THUMBGATE_APP_BUTTON_LABEL,
  THUMBGATE_PICKER_WEB_URL,
  THUMBGATE_WEB_URL,
  resolveLeashThumbGatePromoSurface,
  shouldShowThumbGatePromoOnComputerPicker,
  shouldShowThumbGatePromoOnConnectionPanel,
  thumbGatePromoCopy,
} from '../utils/thumbgatePromoCopy';

describe('thumbgatePromoCopy', () => {
  it('uses thumbgate.app as the canonical web URL', () => {
    expect(THUMBGATE_WEB_URL).toMatch(/^https:\/\/thumbgate\.app\//);
    expect(THUMBGATE_WEB_URL).toContain('utm_campaign=paid_companion');
    expect(THUMBGATE_WEB_URL.endsWith('#pricing')).toBe(true);
    expect(thumbGatePromoCopy('leash_empty').url).toBe(THUMBGATE_WEB_URL);
  });

  it('names ThumbGate.app on the computer-picker unreachable surface', () => {
    const promo = thumbGatePromoCopy('computer_picker_unreachable');
    expect(promo.headline).toMatch(/ThumbGate\.app/);
    expect(promo.body).toMatch(/ThumbGate\.app/);
    expect(promo.body).toMatch(/Continuity/i);
    expect(promo.buttonLabel).toBe(THUMBGATE_APP_BUTTON_LABEL);
    expect(promo.url).toBe(THUMBGATE_PICKER_WEB_URL);
    expect(promo.url).toContain('utm_campaign=computer_picker_unreachable');
    expect(promo.url).toMatch(/^https:\/\/thumbgate\.app\//);
  });

  it('shows Leash promo when disconnected or when connected with no pending approvals', () => {
    expect(
      resolveLeashThumbGatePromoSurface({
        connectionState: 'disconnected',
        pendingApprovalsCount: 0,
      }),
    ).toBe('leash_disconnected');

    expect(
      resolveLeashThumbGatePromoSurface({
        connectionState: 'connected',
        pendingApprovalsCount: 0,
      }),
    ).toBe('leash_empty');

    expect(
      resolveLeashThumbGatePromoSurface({
        connectionState: 'connected',
        pendingApprovalsCount: 2,
      }),
    ).toBeNull();
  });

  it('shows connection promo only when unreachable and never when connected', () => {
    expect(
      shouldShowThumbGatePromoOnConnectionPanel({
        connectionState: 'connected',
        profileCount: 1,
        healExhausted: true,
        activeProfileReachable: false,
      }),
    ).toBe(false);

    expect(
      shouldShowThumbGatePromoOnConnectionPanel({
        connectionState: 'disconnected',
        profileCount: 0,
        healExhausted: false,
        activeProfileReachable: false,
      }),
    ).toBe(true);

    expect(
      shouldShowThumbGatePromoOnConnectionPanel({
        connectionState: 'disconnected',
        profileCount: 2,
        healExhausted: true,
        activeProfileReachable: false,
      }),
    ).toBe(true);

    expect(
      shouldShowThumbGatePromoOnConnectionPanel({
        connectionState: 'connecting',
        profileCount: 2,
        healExhausted: false,
        activeProfileReachable: false,
      }),
    ).toBe(false);
  });

  it('shows Choose-computer promo when selected Mac is unreachable (not while scanning)', () => {
    expect(
      shouldShowThumbGatePromoOnComputerPicker({
        profileCount: 2,
        activeReachable: false,
      }),
    ).toBe(true);

    expect(
      shouldShowThumbGatePromoOnComputerPicker({
        profileCount: 2,
        activeReachable: true,
      }),
    ).toBe(false);

    expect(
      shouldShowThumbGatePromoOnComputerPicker({
        profileCount: 2,
        activeReachable: false,
        scanning: true,
      }),
    ).toBe(false);

    expect(
      shouldShowThumbGatePromoOnComputerPicker({
        profileCount: 2,
        activeReachable: false,
        activeConnecting: true,
      }),
    ).toBe(false);

    expect(
      shouldShowThumbGatePromoOnComputerPicker({
        profileCount: 2,
        activeReachable: false,
        authNeedsRepair: true,
      }),
    ).toBe(false);

    expect(
      shouldShowThumbGatePromoOnComputerPicker({
        profileCount: 0,
        activeReachable: false,
      }),
    ).toBe(false);
  });
});
