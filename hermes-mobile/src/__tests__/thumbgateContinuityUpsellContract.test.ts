import {
  THUMBGATE_WEB_URL,
  THUMBGATE_PROMO_BUTTON_LABEL,
  thumbGatePromoCopy,
  shouldShowThumbGatePromoOnConnectedChat,
  shouldShowThumbGatePromoInSettings,
} from '../utils/thumbgatePromoCopy';
import { THUMBGATE_CONNECTOR_INSTALL_COMMAND } from '../utils/thumbgateFacilitation';

// CEO 2026-07-26: additive Continuity, not broken-connection fallback.
// CEO 2026-08-03: consumer Leash promo is SHORT — no coding agents, no install essay.
// CEO 2026-08-05: always pitch ThumbGate.app on connected chat + Settings (cash path).
//
const LEASH_SURFACES = ['leash_disconnected', 'leash_empty', 'connection_unreachable'] as const;
const ALWAYS_ON_SURFACES = ['chat_connected', 'settings'] as const;

describe('ThumbGate promo is a short consumer upsell', () => {
  it('keeps leash/unreachable copy short and free of agent/dev manuals', () => {
    for (const s of LEASH_SURFACES) {
      const promo = thumbGatePromoCopy(s);
      expect(promo.headline).toBe('ThumbGate.app');
      expect(promo.body).toBe(
        'Web dashboard and Continuity when your computer is offline.',
      );
      expect(promo.body.length).toBeLessThan(90);
      expect(promo.buttonLabel).toBe(THUMBGATE_PROMO_BUTTON_LABEL);
      expect(promo.buttonLabel).toMatch(/ThumbGate\.app/);
      expect(promo.body).not.toMatch(/coding agent|npx skills|one-line Mac installer|Herdr/i);
      expect(promo.body).not.toMatch(
        /phone cannot reach|unable to reach|pair a Mac and continue|replacement for Hermes Mobile/i,
      );
    }
  });

  it('pitches ThumbGate.app while chat is connected and in Settings', () => {
    for (const s of ALWAYS_ON_SURFACES) {
      const promo = thumbGatePromoCopy(s);
      expect(promo.headline).toBe('ThumbGate.app');
      expect(promo.body).toMatch(/ThumbGate|Continuity|dashboard/i);
      expect(promo.body.length).toBeLessThan(100);
      expect(promo.buttonLabel).toMatch(/ThumbGate\.app/);
    }
    expect(
      shouldShowThumbGatePromoOnConnectedChat({
        connectionState: 'connected',
        hasThumbGateCompanion: false,
      }),
    ).toBe(true);
    expect(
      shouldShowThumbGatePromoOnConnectedChat({
        connectionState: 'connected',
        hasThumbGateCompanion: true,
      }),
    ).toBe(false);
    expect(shouldShowThumbGatePromoInSettings({ hasThumbGateCompanion: false })).toBe(true);
    expect(shouldShowThumbGatePromoInSettings({ hasThumbGateCompanion: true })).toBe(false);
  });

  it('attributes mobile conversions and opens /dashboard (product-first)', () => {
    expect(THUMBGATE_WEB_URL).toContain('utm_source=hermes-mobile');
    expect(THUMBGATE_WEB_URL).toContain('utm_campaign=paid_companion');
    expect(THUMBGATE_WEB_URL).toContain('/dashboard');
    expect(THUMBGATE_WEB_URL).not.toContain('#pricing');
    for (const s of [...LEASH_SURFACES, ...ALWAYS_ON_SURFACES]) {
      expect(thumbGatePromoCopy(s).url).toBe(THUMBGATE_WEB_URL);
    }
  });

  it('keeps the public Mac connector command for the web dashboard (not Leash UI)', () => {
    expect(THUMBGATE_CONNECTOR_INSTALL_COMMAND).toContain('install-connector.sh');
  });
});
