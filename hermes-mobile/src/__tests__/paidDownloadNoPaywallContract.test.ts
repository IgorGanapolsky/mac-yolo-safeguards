import { isStorePaidDownloadEntitled } from '../utils/playPaidEntitlement';
import { hasThumbgateLeashPro, isThumbgateLeashUnlocked } from '../utils/thumbgateLeash';
import type { GatewaySettings } from '../types/gateway';

// BUSINESS MODEL CONTRACT (CEO, 2026-07-26): "i don't want any in-app purchases nor asking
// people to unlock anything in our app. we are listing our app for $4.99 on both stores with
// full features."
//
// This is not hypothetical. Both LIVE store builds predate the entitlement logic — the file
// playPaidEntitlement.ts does not exist at 199e1481 (Android v1.4) or 18c301c5 (iOS v1.3) —
// so paying customers currently see "Unlock in Google Play" inside an app they already bought.
// These assertions exist so that regression cannot reach users a second time.
const settings = (over: Partial<GatewaySettings> = {}): GatewaySettings =>
  ({ thumbgateProActive: false, developerLeashUnlock: false, ...over } as GatewaySettings);

describe('paid download = full features, no secondary paywall', () => {
  it('a paid store download is entitled on EVERY platform', () => {
    // Not android-only: iOS is also a $4.99 paid download ("Hermes AI Agent Leash", v1.3).
    expect(isStorePaidDownloadEntitled()).toBe(true);
  });

  it('Pro is on even when no IAP was purchased and no dev unlock is set', () => {
    expect(hasThumbgateLeashPro(settings())).toBe(true);
  });

  it('Leash is never gated behind a purchase or a weekly allowance', () => {
    expect(isThumbgateLeashUnlocked(settings())).toBe(true);
  });

  it('stays unlocked regardless of stored purchase flags', () => {
    expect(hasThumbgateLeashPro(settings({ thumbgateProActive: false }))).toBe(true);
    expect(isThumbgateLeashUnlocked(settings({ thumbgateProActive: false }))).toBe(true);
  });
});
