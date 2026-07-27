import { thumbGatePromoCopy } from '../utils/thumbgatePromoCopy';

// CEO, 2026-07-26: the promo must sell ThumbGate.app as an ADDITION to the mobile app and
// drive paid signups — not present it as a fallback for a broken connection.
//
// Researched 2026-07-26 (thumbgate.app + apps/hermes-control-plane/lib/entitlements.ts and
// agent-governance.ts): the web dashboard is FREE for any active plan; the paid `pro`/`team`
// tiers buy CLOUD CONTINUITY (402 `cloud_entitlement_required` without trial/subscription).
// So "when your phone cannot reach your computer" was factually wrong — ThumbGate does not
// fix phone-to-Mac connectivity — and it sold a paid product as a consolation prize.
const SURFACES = ['leash_disconnected', 'leash_empty', 'connection_unreachable'] as const;

describe('ThumbGate promo is a continuity upsell, not a failure fallback', () => {
  it('never claims ThumbGate fixes phone-to-Mac connectivity', () => {
    for (const s of SURFACES) {
      const { headline, body } = thumbGatePromoCopy(s);
      const text = `${headline} ${body}`.toLowerCase();
      expect(text).not.toMatch(/cannot reach|can't reach|unable to reach/);
    }
  });

  it('leads with the paid value: work continues when the Mac is offline', () => {
    for (const s of SURFACES) {
      const { headline, body } = thumbGatePromoCopy(s);
      const text = `${headline} ${body}`.toLowerCase();
      expect(text).toMatch(/continuity|cloud/);
      expect(text).toMatch(/offline|asleep|sleeps/);
    }
  });

  it('still points at the real product URL', () => {
    for (const s of SURFACES) {
      expect(thumbGatePromoCopy(s).url).toMatch(/^https:\/\/thumbgate\.app/);
    }
  });
});
