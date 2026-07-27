import {
  THUMBGATE_WEB_URL,
  resolveLeashThumbGatePromoSurface,
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
});
