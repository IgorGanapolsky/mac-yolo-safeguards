import fs from 'fs';
import path from 'path';
import { thumbGatePromoCopy, THUMBGATE_PROMO_BUTTON_LABEL } from '../utils/thumbgatePromoCopy';

// CEO, repeatedly: "this should say ThumbGate.app, not just ThumbGate".
// The web product is named ThumbGate.app. Bare "ThumbGate" in a promo reads as a vague
// feature name and gives the user nothing to type into a browser.
//
// Product/tier names ("ThumbGate Leash", "ThumbGate Pro") are NOT covered — those are
// in-app tiers, not the website.
const SURFACES = ['leash_disconnected', 'leash_empty', 'connection_unreachable'] as const;

describe('ThumbGate.app brand name in promo surfaces', () => {
  it('every promo surface names the site, not bare "ThumbGate"', () => {
    for (const s of SURFACES) {
      const { headline, body } = thumbGatePromoCopy(s);
      expect(`${headline} ${body}`).toMatch(/ThumbGate\.app/);
    }
  });

  it('the CTA button names the site', () => {
    expect(THUMBGATE_PROMO_BUTTON_LABEL).toMatch(/ThumbGate\.app/);
  });

  it('no user-facing promo STRING says bare "ThumbGate" (comments are exempt)', () => {
    // Only the rendered strings matter — code comments legitimately say "ThumbGate web funnel".
    const strings = SURFACES.flatMap((s) => {
      const { headline, body } = thumbGatePromoCopy(s);
      return [headline, body];
    }).concat(THUMBGATE_PROMO_BUTTON_LABEL);

    for (const text of strings) {
      const stripped = text
        .replace(/ThumbGate\.app/g, '')
        .replace(/ThumbGate (Leash|Pro|Continuity)/g, '');
      expect(stripped).not.toMatch(/ThumbGate/);
    }
  });
});
