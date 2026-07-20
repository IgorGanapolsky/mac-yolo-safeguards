import React from 'react';
import { Platform } from 'react-native';
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
  HERMES_PRO_LIFETIME_IAP_PRODUCT_ID: 'hermes_pro_lifetime',
  purchaseThumbgateLeash: jest.fn(() => Promise.resolve({ status: 'purchased' })),
  restoreThumbgateLeashPurchases: jest.fn(() => Promise.resolve({ status: 'error', message: 'none' })),
  thumbgateIapSubscribeLabel: jest.fn(() => 'Unlock in Google Play'),
}));

describe('ProUpgradeCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  });

  it('tracks paywall view and purchase funnel for Android lifetime unlock', async () => {
    const onUnlocked = jest.fn();
    const { getByTestId, getByText, getAllByText, queryByText } = render(
      <ProUpgradeCard onUnlocked={onUnlocked} />,
    );

    await waitFor(() => {
      expect(trackProductEvent).toHaveBeenCalledWith('leash_paywall_view', {
        product_id: 'hermes_pro_lifetime',
      });
    });

    expect(getByText(/one-time unlock on Google Play/i)).toBeTruthy();
    expect(getAllByText(/\$4\.99 once/i).length).toBeGreaterThan(0);
    expect(queryByText(/\$19/)).toBeNull();
    expect(queryByText(/Subscribe/i)).toBeNull();

    fireEvent.press(getByTestId('subscribe-thumbgate-leash-iap'));

    await waitFor(() => {
      expect(purchaseThumbgateLeash).toHaveBeenCalledTimes(1);
      expect(trackProductEvent).toHaveBeenCalledWith('upgrade_tap_thumbgate_iap');
      expect(trackProductEvent).toHaveBeenCalledWith('leash_purchase_start', {
        product_id: 'hermes_pro_lifetime',
      });
      expect(trackProductEvent).toHaveBeenCalledWith('leash_purchase_result', {
        product_id: 'hermes_pro_lifetime',
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
        product_id: 'hermes_pro_lifetime',
        status: 'error',
      });
    });
  });

  it('does not hero $19/mo on iOS and keeps restore for existing subscribers', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    const { getByTestId, queryByText, getByText } = render(<ProUpgradeCard />);

    await waitFor(() => {
      expect(trackProductEvent).toHaveBeenCalledWith('leash_paywall_view', {
        product_id: 'thumbgate_leash_monthly',
      });
    });

    expect(queryByText(/\$19/)).toBeNull();
    expect(getByText(/Existing App Store subscribers keep access/i)).toBeTruthy();
    expect(getByTestId('restore-thumbgate-leash')).toBeTruthy();
  });
});
