import fs from 'fs';
import path from 'path';
import {
  HERMES_MOBILE_ANDROID_PACKAGE,
  HERMES_MOBILE_ANDROID_PAID_PACKAGE,
  HERMES_PLAY_PAID_APP_ID,
  HERMES_PLAY_PAID_PRICE_USD,
} from '../constants/appIdentity';

const root = path.resolve(__dirname, '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Play paid download contract', () => {
  it('keeps free package distinct from paid package', () => {
    expect(HERMES_MOBILE_ANDROID_PACKAGE).toBe('com.iganapolsky.hermesmobile');
    expect(HERMES_MOBILE_ANDROID_PAID_PACKAGE).toBe('com.iganapolsky.hermesmobile.paid');
    expect(HERMES_MOBILE_ANDROID_PAID_PACKAGE).not.toBe(HERMES_MOBILE_ANDROID_PACKAGE);
    expect(HERMES_PLAY_PAID_APP_ID).toBe('4972002147362988720');
    expect(HERMES_PLAY_PAID_PRICE_USD).toBe('4.99');
  });

  it('documents the Free→Paid package split', () => {
    const doc = read('hermes-mobile/docs/PLAY-PAID-DOWNLOAD.md');
    expect(doc).toContain(HERMES_MOBILE_ANDROID_PAID_PACKAGE);
    expect(doc).toContain('cannot');
    expect(doc).toContain('hermes_pro_lifetime');
    expect(doc).toContain(HERMES_PLAY_PAID_APP_ID);
  });

  it('wires EAS production-android-paid profile to paid SKU env', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.build['production-android-paid'].env.HERMES_ANDROID_STORE_SKU).toBe('paid');
    expect(eas.build['production-android-paid'].env.EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD).toBe('1');
    expect(eas.build['production-android-paid'].android.buildType).toBe('app-bundle');
    expect(eas.submit['production-android-paid'].android.track).toBe('production');
  });

  it('app.config.js switches android.package for paid SKU', () => {
    const configSrc = read('hermes-mobile/app.config.js');
    expect(configSrc).toContain('com.iganapolsky.hermesmobile.paid');
    expect(configSrc).toContain('HERMES_ANDROID_STORE_SKU');
    expect(configSrc).toContain('androidStoreSku');
  });
});
