jest.mock('expo-iap', () => ({
  initConnection: jest.fn(() => Promise.resolve(true)),
  finishTransaction: jest.fn(() => Promise.resolve()),
  fetchProducts: jest.fn(() =>
    Promise.resolve([{ id: 'thumbgate_leash_monthly', productId: 'thumbgate_leash_monthly' }]),
  ),
  hasActiveSubscriptions: jest.fn(() => Promise.resolve(false)),
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
  THUMBGATE_LEASH_IAP_PRODUCT_ID,
  verifyThumbgateLeashProductConfigured,
} from '../services/thumbgateIap';
import * as ExpoIap from 'expo-iap';

describe('thumbgateIap', () => {
  it('defines a store product id', () => {
    expect(THUMBGATE_LEASH_IAP_PRODUCT_ID).toBe('thumbgate_leash_monthly');
  });

  it('labels subscribe for the current platform', () => {
    expect(thumbgateIapSubscribeLabel()).toBe('Start Pro - $19/mo');
  });

  it('sync entitlement uses store API', async () => {
    const entitled = await syncThumbgateLeashEntitlement();
    expect(entitled).toBe(false);
  });

  it('verifies store product id before purchase', async () => {
    const check = await verifyThumbgateLeashProductConfigured();
    expect(check.configured).toBe(true);
    expect(ExpoIap.fetchProducts).toHaveBeenCalledWith({
      skus: ['thumbgate_leash_monthly'],
      type: 'subs',
    });
  });

  it('reports when store product is missing', async () => {
    jest.mocked(ExpoIap.fetchProducts).mockResolvedValueOnce([]);
    const check = await verifyThumbgateLeashProductConfigured();
    expect(check.configured).toBe(false);
    if (!check.configured) {
      expect(check.message).toContain('thumbgate_leash_monthly');
    }
  });

  it('restore reports when no subscription is active', async () => {
    const result = await restoreThumbgateLeashPurchases();
    expect(result.status).toBe('error');
  });
});
