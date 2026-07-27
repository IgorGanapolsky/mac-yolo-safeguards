import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('no in-app subscription purchase contract', () => {
  it('keeps IN_APP_SUBSCRIPTION_PURCHASES_ENABLED hard-off', () => {
    const src = readSrc('services/thumbgateIap.ts');
    expect(src).toMatch(/export const IN_APP_SUBSCRIPTION_PURCHASES_ENABLED = false/);
  });

  it('never requestPurchase type subs from the mobile IAP service', () => {
    const src = readSrc('services/thumbgateIap.ts');
    expect(src).not.toMatch(/type:\s*['"]subs['"]/);
    expect(src).not.toMatch(/type:\s*isAndroidLifetimeUnlock\(\)\s*\?\s*['"]in-app['"]\s*:\s*['"]subs['"]/);
    // Lifetime Android path only
    expect(src).toMatch(/type:\s*['"]in-app['"]/);
    expect(src).toMatch(/Subscriptions are managed on the ThumbGate web dashboard/);
  });

  it('ProUpgradeCard has no iOS StoreKit subscription purchase CTA', () => {
    const src = readSrc('components/ProUpgradeCard.tsx');
    expect(src).toMatch(/open-thumbgate-web-subscription/);
    expect(src).toMatch(/THUMBGATE_WEB_SUBSCRIPTION_URL/);
    expect(src).toMatch(/does not sell subscriptions/);
    expect(src).not.toMatch(/\$19\.99/);
    expect(src).not.toMatch(/auto-renewing/);
    expect(src).not.toMatch(/Settings → Apple ID → Subscriptions/);
  });

  it('monetization constants expose web subscription URL and no \$19/mo primary label', () => {
    const src = readSrc('constants/monetization.ts');
    expect(src).toMatch(/THUMBGATE_WEB_SUBSCRIPTION_URL/);
    expect(src).toMatch(/paid App Store download/);
    expect(src).not.toMatch(/\$19\.99\/mo/);
  });
});
