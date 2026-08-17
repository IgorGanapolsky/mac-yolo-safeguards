import {
  THUMBGATE_WEB_URL,
  THUMBGATE_PROMO_BUTTON_LABEL,
  thumbGatePromoCopy,
} from '../utils/thumbgatePromoCopy';
import { THUMBGATE_CONNECTOR_INSTALL_COMMAND } from '../utils/thumbgateFacilitation';

// CEO 2026-07-26: additive Continuity, not broken-connection fallback.
// CEO 2026-08-03: consumer Leash promo is SHORT — no coding agents, no install essay.
//
const SURFACES = ['leash_disconnected', 'leash_empty', 'connection_unreachable'] as const;

describe('ThumbGate promo is a short consumer upsell', () => {
  it('keeps copy short and free of agent/dev manuals', () => {
    for (const s of SURFACES) {
      const promo = thumbGatePromoCopy(s);
      expect(promo.headline).toBe('Cloud Continuity');
      expect(promo.body).toBe(
        '24/7 Agent Session Persistence & Background VPS Sandbox.',
      );
      expect(promo.body.length).toBeLessThan(90);
      expect(promo.buttonLabel).toBe(THUMBGATE_PROMO_BUTTON_LABEL);
      expect(promo.buttonLabel).toMatch(/Cloud Continuity/);
      expect(promo.body).not.toMatch(/coding agent|npx skills|one-line Mac installer|Herdr/i);
      expect(promo.body).not.toMatch(
        /phone cannot reach|unable to reach|pair a Mac and continue|replacement for Hermes Mobile/i,
      );
    }
  });

  it('attributes mobile conversions and opens /dashboard (product-first)', () => {
    expect(THUMBGATE_WEB_URL).toContain('utm_source=hermes-mobile');
    expect(THUMBGATE_WEB_URL).toContain('utm_campaign=paid_companion');
    expect(THUMBGATE_WEB_URL).toContain('/dashboard');
    expect(THUMBGATE_WEB_URL).not.toContain('#pricing');
    for (const s of SURFACES) {
      expect(thumbGatePromoCopy(s).url).toBe(THUMBGATE_WEB_URL);
    }
  });

  it('keeps the public Mac connector command for the web dashboard (not Leash UI)', () => {
    expect(THUMBGATE_CONNECTOR_INSTALL_COMMAND).toContain('install-connector.sh');
  });
});
