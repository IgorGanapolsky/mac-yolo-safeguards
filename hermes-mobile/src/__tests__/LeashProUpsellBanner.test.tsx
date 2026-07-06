import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LeashProUpsellBanner from '../components/LeashProUpsellBanner';
import { THUMBGATE_PRO_PRICE_LABEL } from '../constants/monetization';

jest.mock('../services/thumbgateIap', () => ({
  THUMBGATE_LEASH_IAP_PRODUCT_ID: 'thumbgate_leash_monthly',
  purchaseThumbgateLeash: jest.fn(() => Promise.resolve({ status: 'purchased' })),
  restoreThumbgateLeashPurchases: jest.fn(() => Promise.resolve({ status: 'error', message: 'none' })),
  thumbgateIapSubscribeLabel: jest.fn(() => 'Subscribe in Google Play'),
}));

describe('LeashProUpsellBanner', () => {
  it('renders paywall headline, bullets, and upgrade card', () => {
    const { getByTestId, getByText, queryByTestId } = render(<LeashProUpsellBanner />);
    const upsell = getByTestId('gate-rules-pro-upsell');
    expect(upsell).toBeTruthy();
    expect(getByTestId('leash-paywall-headline')).toHaveTextContent(/kill switch/);
    expect(getByTestId('leash-paywall-bullets')).toHaveTextContent(/force-push/);
    expect(getByTestId('leash-paywall-bullets')).toHaveTextContent(/allow\/block rules/);
    expect(upsell).toHaveTextContent(new RegExp(THUMBGATE_PRO_PRICE_LABEL.replace('$', '\\$')));
    expect(getByText(/Hermes chat stays free/)).toBeTruthy();
    expect(upsell).not.toHaveTextContent(/What is ThumbGate Pro/i);
    expect(upsell).not.toHaveTextContent(/What is ThumbGate Leash/i);
    expect(getByTestId('pro-upgrade-card')).toBeTruthy();
    expect(queryByTestId('leash-paywall-learn-more')).toBeNull();
  });

  it('expands learn-more on tap', () => {
    const { getByTestId, queryByTestId } = render(<LeashProUpsellBanner />);
    expect(queryByTestId('leash-paywall-learn-more')).toBeNull();
    fireEvent.press(getByTestId('leash-paywall-learn-more-toggle'));
    expect(getByTestId('leash-paywall-learn-more')).toBeTruthy();
  });
});
