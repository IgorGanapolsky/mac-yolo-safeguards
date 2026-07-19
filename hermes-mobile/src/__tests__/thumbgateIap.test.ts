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
  HERMES_PRO_LIFETIME_IAP_PRODUCT_ID,
  THUMBGATE_LEASH_IAP_PRODUCT_ID,
} from '../services/thumbgateIap';

describe('thumbgateIap', () => {
  it('defines a store product id', () => {
    expect(THUMBGATE_LEASH_IAP_PRODUCT_ID).toBe('thumbgate_leash_monthly');
    expect(HERMES_PRO_LIFETIME_IAP_PRODUCT_ID).toBe('hermes_pro_lifetime');
  });

  it('labels subscribe for the current platform', () => {
    expect(thumbgateIapSubscribeLabel()).toMatch(/(Subscribe|Unlock) in/);
  });

  it('sync entitlement uses store API', async () => {
    const entitled = await syncThumbgateLeashEntitlement();
    expect(entitled).toBe(false);
  });

  it('restore reports when no subscription is active', async () => {
    const result = await restoreThumbgateLeashPurchases();
    expect(result.status).toBe('error');
  });
});
