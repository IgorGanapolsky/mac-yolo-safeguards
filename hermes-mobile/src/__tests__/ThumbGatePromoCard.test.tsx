import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ThumbGatePromoCard from '../components/ThumbGatePromoCard';
import { trackProductEvent } from '../services/productAnalytics';

jest.mock('../services/productAnalytics', () => ({
  trackProductEvent: jest.fn(() => Promise.resolve()),
}));

describe('ThumbGatePromoCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders short consumer copy and one open CTA — no coding or install essay', async () => {
    const { getByTestId, getByText, queryByText, queryByTestId } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    expect(getByTestId('thumbgate-promo-connection_unreachable')).toBeTruthy();
    expect(getByText('ThumbGate.app')).toBeTruthy();
    expect(getByText('Web dashboard and Continuity when your computer is offline.')).toBeTruthy();
    expect(getByText('Open ThumbGate.app')).toBeTruthy();

    // Must not pollute Leash with agent/dev manuals.
    expect(queryByText(/Coding agents/i)).toBeNull();
    expect(queryByText(/one-line Mac installer/i)).toBeNull();
    expect(queryByText(/npx skills/i)).toBeNull();
    expect(queryByTestId('thumbgate-facilitation-steps')).toBeNull();
    expect(queryByTestId('thumbgate-connector-install-command')).toBeNull();
    expect(queryByTestId('thumbgate-promo-share-installer')).toBeNull();
    expect(queryByTestId('thumbgate-promo-share-skill')).toBeNull();

    expect(trackProductEvent).toHaveBeenCalledWith('thumbgate_promo_view', {
      surface: 'connection_unreachable',
    });

    fireEvent.press(getByTestId('thumbgate-promo-open'));

    await waitFor(() => {
      expect(trackProductEvent).toHaveBeenCalledWith('thumbgate_promo_tap', {
        surface: 'connection_unreachable',
        action: 'open_in_app_sheet',
      });
      expect(getByText(/Cloud Continuity & VPS Hub/i)).toBeTruthy();
    });
  });

  it('opens in-app continuity sheet even when analytics never resolves', async () => {
    (trackProductEvent as jest.Mock).mockImplementation(
      () => new Promise(() => {}),
    );

    const { getByTestId, getByText } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    fireEvent.press(getByTestId('thumbgate-promo-open'));

    await waitFor(() => {
      expect(getByText(/Cloud Continuity & VPS Hub/i)).toBeTruthy();
    });
  });
});
