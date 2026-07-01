import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ProUpgradeCard from '../components/ProUpgradeCard';
import { trackProductEvent } from '../services/productAnalytics';
import {
  purchaseThumbgateLeash,
  restoreThumbgateLeashPurchases,
} from '../services/thumbgateIap';

jest.mock('../services/productAnalytics', () => ({
  trackProductEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/thumbgateIap', () => ({
  THUMBGATE_LEASH_IAP_PRODUCT_ID: 'thumbgate_leash_monthly',
  purchaseThumbgateLeash: jest.fn(() => Promise.resolve({ status: 'purchased' })),
  restoreThumbgateLeashPurchases: jest.fn(() => Promise.resolve({ status: 'error', message: 'none' })),
  thumbgateIapSubscribeLabel: jest.fn(() => 'Subscribe in Google Play'),
}));

describe('ProUpgradeCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tracks paywall view and purchase funnel outcome', async () => {
    const onUnlocked = jest.fn();
    const { getByTestId } = render(<ProUpgradeCard onUnlocked={onUnlocked} />);

    await waitFor(() => {
      expect(trackProductEvent).toHaveBeenCalledWith('leash_paywall_view', {
        product_id: 'thumbgate_leash_monthly',
      });
    });

    fireEvent.press(getByTestId('subscribe-thumbgate-leash-iap'));

    await waitFor(() => {
      expect(purchaseThumbgateLeash).toHaveBeenCalledTimes(1);
      expect(trackProductEvent).toHaveBeenCalledWith('upgrade_tap_thumbgate_iap');
      expect(trackProductEvent).toHaveBeenCalledWith('leash_purchase_start', {
        product_id: 'thumbgate_leash_monthly',
      });
      expect(trackProductEvent).toHaveBeenCalledWith('leash_purchase_result', {
        product_id: 'thumbgate_leash_monthly',
        status: 'purchased',
      });
      expect(onUnlocked).toHaveBeenCalledTimes(1);
    });
  });

  it('tracks restore outcome', async () => {
    const { getByTestId } = render(<ProUpgradeCard />);
    fireEvent.press(getByTestId('restore-thumbgate-leash'));

    await waitFor(() => {
      expect(restoreThumbgateLeashPurchases).toHaveBeenCalledTimes(1);
      expect(trackProductEvent).toHaveBeenCalledWith('upgrade_tap_thumbgate_restore');
      expect(trackProductEvent).toHaveBeenCalledWith('leash_restore_result', {
        product_id: 'thumbgate_leash_monthly',
        status: 'error',
      });
    });
  });
});
