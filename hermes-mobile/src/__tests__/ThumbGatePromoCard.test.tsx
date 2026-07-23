import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import ThumbGatePromoCard from '../components/ThumbGatePromoCard';
import { trackProductEvent } from '../services/productAnalytics';
import { THUMBGATE_WEB_URL } from '../utils/thumbgatePromoCopy';

jest.mock('../services/productAnalytics', () => ({
  trackProductEvent: jest.fn(() => Promise.resolve()),
}));

describe('ThumbGatePromoCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders copy and opens thumbgate.app with analytics', async () => {
    const { getByTestId, getByText } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    expect(getByTestId('thumbgate-promo-connection_unreachable')).toBeTruthy();
    expect(getByText('Try Hermes on the web')).toBeTruthy();
    expect(trackProductEvent).toHaveBeenCalledWith('thumbgate_promo_view', {
      surface: 'connection_unreachable',
    });

    fireEvent.press(getByTestId('thumbgate-promo-open'));

    await waitFor(() => {
      expect(trackProductEvent).toHaveBeenCalledWith('thumbgate_promo_tap', {
        surface: 'connection_unreachable',
        url: THUMBGATE_WEB_URL,
      });
      expect(Linking.openURL).toHaveBeenCalledWith(THUMBGATE_WEB_URL);
    });
  });
});
