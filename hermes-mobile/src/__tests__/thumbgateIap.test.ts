import {
  purchaseThumbgateLeash,
  thumbgateIapSubscribeLabel,
  THUMBGATE_LEASH_IAP_PRODUCT_ID,
} from '../services/thumbgateIap';

describe('thumbgateIap', () => {
  it('defines a store product id', () => {
    expect(THUMBGATE_LEASH_IAP_PRODUCT_ID).toBe('thumbgate_leash_monthly');
  });

  it('returns not_configured until native billing is wired', async () => {
    const result = await purchaseThumbgateLeash();
    expect(result.status).toBe('not_configured');
  });

  it('labels subscribe for the current platform', () => {
    expect(thumbgateIapSubscribeLabel()).toMatch(/Subscribe in/);
  });
});
