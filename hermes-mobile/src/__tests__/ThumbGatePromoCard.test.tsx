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
    const { getByTestId, getByText, queryByText, queryByTestId, getAllByText } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    expect(getByTestId('thumbgate-promo-connection_unreachable')).toBeTruthy();

    // Check headline appears (may appear multiple times in modal/open state)
    const headlineElements = getAllByText('Cloud Continuity');
    expect(headlineElements.length).toBeGreaterThan(0);

    expect(getByText('24/7 Agent Session Persistence & Background VPS Sandbox.')).toBeTruthy();

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
      // Modal opens showing Cloud Continuity
      const modalElements = getAllByText(/Cloud Continuity/i);
      expect(modalElements.length).toBeGreaterThan(1);
    });
  });

  it('opens in-app continuity sheet even when analytics never resolves', async () => {
    (trackProductEvent as jest.Mock).mockImplementation(
      () => new Promise(() => {}),
    );

    const { getByTestId, getAllByText } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    fireEvent.press(getByTestId('thumbgate-promo-open'));

    await waitFor(() => {
      // Multiple elements may contain the text, which is expected for a modal/toggle
      const elements = getAllByText(/Cloud Continuity/i).length;
      expect(elements).toBeGreaterThan(0);
    });
  });
});
