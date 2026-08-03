import {
  THUMBGATE_WEB_URL,
  THUMBGATE_PROMO_BUTTON_LABEL,
  thumbGatePromoCopy,
} from '../utils/thumbgatePromoCopy';
import {
  THUMBGATE_CONNECTOR_INSTALL_COMMAND,
  THUMBGATE_CONNECTOR_INSTALL_BUTTON_LABEL,
} from '../utils/thumbgateFacilitation';

// CEO, 2026-07-26: the promo must sell ThumbGate.app as an ADDITION to the mobile app and
// drive paid signups — not present it as a fallback for a broken connection.
// 2026-08-02: also facilitate install when ThumbGate.app is absent (Herdr-style one-liner + web).
// Public brand: always ThumbGate.app (never bare "ThumbGate" in promo CTAs).
//
const SURFACES = ['leash_disconnected', 'leash_empty', 'connection_unreachable'] as const;

describe('ThumbGate promo is a continuity upsell + absence facilitation', () => {
  it('positions ThumbGate.app as additive Continuity and facilitates install when absent', () => {
    for (const s of SURFACES) {
      const promo = thumbGatePromoCopy(s);
      expect(promo.headline).toBe('No ThumbGate.app yet?');
      expect(promo.headline).toMatch(/ThumbGate\.app/);
      expect(promo.body).toMatch(/Hermes Mobile still chats with your computer/);
      expect(promo.body).toMatch(/ThumbGate\.app/);
      expect(promo.body).toMatch(/Continuity/);
      expect(promo.body).toMatch(/one-line Mac installer/);
      expect(promo.buttonLabel).toBe(THUMBGATE_PROMO_BUTTON_LABEL);
      expect(promo.buttonLabel).toMatch(/ThumbGate\.app/);
      expect(promo.secondaryButtonLabel).toBe(THUMBGATE_CONNECTOR_INSTALL_BUTTON_LABEL);
      // Must not frame the whole product as "phone broken → use web instead"
      expect(promo.body).not.toMatch(
        /phone cannot reach|unable to reach|pair a Mac and continue|replacement for Hermes Mobile/i,
      );
    }
  });

  it('attributes mobile conversions and opens /dashboard (product-first, not #pricing)', () => {
    expect(THUMBGATE_WEB_URL).toContain('utm_source=hermes-mobile');
    expect(THUMBGATE_WEB_URL).toContain('utm_campaign=paid_companion');
    expect(THUMBGATE_WEB_URL).toContain('/dashboard');
    expect(THUMBGATE_WEB_URL).not.toContain('#pricing');
    for (const s of SURFACES) {
      expect(thumbGatePromoCopy(s).url).toBe(THUMBGATE_WEB_URL);
    }
  });

  it('shares the same Mac installer command as the web dashboard', () => {
    expect(THUMBGATE_CONNECTOR_INSTALL_COMMAND).toContain('install-connector.sh');
  });
});
