jest.mock('expo-iap', () => ({
  initConnection: jest.fn(() => Promise.resolve(true)),
  finishTransaction: jest.fn(() => Promise.resolve()),
  hasActiveSubscriptions: jest.fn(() => Promise.resolve(false)),
  getAvailablePurchases: jest.fn(() => Promise.resolve([])),
  requestPurchase: jest.fn(() => Promise.resolve()),
  restorePurchases: jest.fn(() => Promise.resolve()),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
}));

import {
  purchaseThumbgateLeash,
  restoreThumbgateLeashPurchases,
  syncThumbgateLeashEntitlement,
  thumbgateIapSubscribeLabel,
  supportsInAppPaidUnlock,
  IN_APP_SUBSCRIPTION_PURCHASES_ENABLED,
  HERMES_PRO_LIFETIME_IAP_PRODUCT_ID,
  THUMBGATE_LEASH_IAP_PRODUCT_ID,
} from '../services/thumbgateIap';
import { Platform } from 'react-native';

describe('thumbgateIap', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
    jest.clearAllMocks();
  });

  it('defines product ids and keeps in-app subscriptions disabled', () => {
    expect(THUMBGATE_LEASH_IAP_PRODUCT_ID).toBe('thumbgate_leash_monthly');
    expect(HERMES_PRO_LIFETIME_IAP_PRODUCT_ID).toBe('hermes_pro_lifetime');
    expect(IN_APP_SUBSCRIPTION_PURCHASES_ENABLED).toBe(false);
  });

  it('labels Android unlock vs iOS web subscription CTA', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    expect(thumbgateIapSubscribeLabel()).toBe('Unlock in Google Play');
    expect(supportsInAppPaidUnlock()).toBe(true);

    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    expect(thumbgateIapSubscribeLabel()).toBe('Manage on ThumbGate web');
    expect(supportsInAppPaidUnlock()).toBe(false);
  });

  it('sync entitlement uses store API', async () => {
    const entitled = await syncThumbgateLeashEntitlement();
    expect(entitled).toBe(false);
  });

  it('does not grant Android entitlement from the retired monthly SKU', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    const iap = require('expo-iap') as {
      getAvailablePurchases: jest.Mock;
    };
    iap.getAvailablePurchases.mockResolvedValue([
      { productId: THUMBGATE_LEASH_IAP_PRODUCT_ID },
    ]);

    await expect(syncThumbgateLeashEntitlement()).resolves.toBe(false);
  });

  it('iOS purchase path never opens StoreKit subscription checkout', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    const iap = require('expo-iap') as { requestPurchase: jest.Mock };

    const result = await purchaseThumbgateLeash();

    expect(result.status).toBe('not_configured');
    expect(result).toMatchObject({
      message: expect.stringMatching(/web dashboard|does not sell subscriptions/i),
    });
    expect(iap.requestPurchase).not.toHaveBeenCalled();
  });

  it('Android lifetime purchase uses in-app type only', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    const iap = require('expo-iap') as {
      requestPurchase: jest.Mock;
      getAvailablePurchases: jest.Mock;
    };
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.requestPurchase.mockImplementation(() => new Promise(() => {}));

    void purchaseThumbgateLeash();
    await new Promise((r) => setImmediate(r));

    expect(iap.requestPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'in-app',
        request: { google: { skus: [HERMES_PRO_LIFETIME_IAP_PRODUCT_ID] } },
      }),
    );
    expect(iap.requestPurchase.mock.calls[0][0].type).not.toBe('subs');
  });

  it('restore reports when no purchase is active', async () => {
    const result = await restoreThumbgateLeashPurchases();
    expect(result.status).toBe('error');
  });
});
