import {
  THUMBGATE_WEB_URL,
  thumbGatePromoCopy,
} from '../utils/thumbgatePromoCopy';

// CEO, 2026-07-26: the promo must sell ThumbGate.app as an ADDITION to the mobile app and
// drive paid signups — not present it as a fallback for a broken connection.
//
const SURFACES = ['leash_disconnected', 'leash_empty', 'connection_unreachable'] as const;

describe('ThumbGate promo is a continuity upsell, not a failure fallback', () => {
  it('positions the plans as an additive paid companion on every surface', () => {
    for (const s of SURFACES) {
      const promo = thumbGatePromoCopy(s);
      expect(promo.headline).toBe('Upgrade Hermes with ThumbGate.app');
      expect(promo.body).toMatch(/Add a web dashboard and paid Continuity on ThumbGate\.app/);
      expect(promo.body).toMatch(/Leash controls/);
      expect(promo.body).toMatch(/eligible work moving when your Mac is offline/);
      expect(promo.buttonLabel).toBe('See ThumbGate.app plans');
      expect(promo.body).not.toMatch(
        /phone cannot reach|can't reach|unable to reach|pair a Mac and continue|replacement|instead/i,
      );
    }
  });

  it('attributes mobile conversions and opens the pricing section', () => {
    expect(THUMBGATE_WEB_URL).toContain('utm_source=hermes-mobile');
    expect(THUMBGATE_WEB_URL).toContain('utm_campaign=paid_companion');
    expect(THUMBGATE_WEB_URL.endsWith('#pricing')).toBe(true);
    for (const s of SURFACES) {
      expect(thumbGatePromoCopy(s).url).toBe(THUMBGATE_WEB_URL);
    }
  });
});
