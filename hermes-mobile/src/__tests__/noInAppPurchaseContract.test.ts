import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('paid app has no in-app purchase path', () => {
  it('has no mobile billing service or paywall component', () => {
    expect(fs.existsSync(path.join(ROOT, 'services/thumbgateIap.ts'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'components/ProUpgradeCard.tsx'))).toBe(false);
  });

  it('does not ship the Expo billing dependency or config plugin', () => {
    const packageJson = readSrc('../package.json');
    const appJson = readSrc('../app.json');
    expect(packageJson).not.toMatch(/expo-iap/);
    expect(appJson).not.toMatch(/expo-iap|Play Billing|billingclient/i);
  });

  it('keeps the paid app fully entitled on every package', () => {
    const entitlement = readSrc('utils/playPaidEntitlement.ts');
    expect(entitlement).toMatch(/isStorePaidDownloadEntitled\(\): boolean \{\s*return true;/);
  });

  it('does not render legacy free-tier or second-payment copy', () => {
    const approvals = readSrc('screens/ApprovalsScreen.tsx');
    expect(approvals).not.toMatch(
      /Unlock in Google Play|Restore purchases|Free tier includes|Hermes Chat is free|ProUpgradeCard/,
    );
  });
});
