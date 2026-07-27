import {
  THUMBGATE_WEB_URL,
  resolveLeashThumbGatePromoSurface,
  shouldShowThumbGatePromoOnConnectionPanel,
  thumbGatePromoCopy,
} from '../utils/thumbgatePromoCopy';

describe('thumbgatePromoCopy', () => {
  it('uses thumbgate.app as the canonical web URL', () => {
    expect(THUMBGATE_WEB_URL).toMatch(/^https:\/\/thumbgate\.app\//);
    expect(thumbGatePromoCopy('leash_empty').url).toBe(THUMBGATE_WEB_URL);
  });

  it('returns honest copy per surface without implying a live Mac connection', () => {
    const disconnected = thumbGatePromoCopy('leash_disconnected');
    expect(disconnected.headline).toBe('Self-Improving Firewall on the web');
    expect(disconnected.body).toMatch(/Your Mac still runs the work locally/);
    expect(disconnected.body).toMatch(/lesson-backed gates/);

    const unreachable = thumbGatePromoCopy('connection_unreachable');
    expect(unreachable.headline).toBe('Try ThumbGate.app');
    expect(unreachable.body).toMatch(/ThumbGate\.app/);
    expect(unreachable.body).toMatch(/cannot reach your computer/i);
    expect(unreachable.body).not.toMatch(/connected/i);
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
