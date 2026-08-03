import React from 'react';
import { Alert, Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ThumbGatePromoCard, {
  OPEN_FAIL_MESSAGE,
  OPEN_FAIL_TITLE,
} from '../components/ThumbGatePromoCard';
import { trackProductEvent } from '../services/productAnalytics';
import { THUMBGATE_WEB_URL } from '../utils/thumbgatePromoCopy';

jest.mock('../services/productAnalytics', () => ({
  trackProductEvent: jest.fn(() => Promise.resolve()),
}));

describe('ThumbGatePromoCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
        url: THUMBGATE_WEB_URL,
        action: 'open_web',
      });
      expect(Linking.openURL).toHaveBeenCalledWith(THUMBGATE_WEB_URL);
    });
  });

  it('opens ThumbGate even when analytics never resolves', async () => {
    (trackProductEvent as jest.Mock).mockImplementation(
      () => new Promise(() => {}),
    );

    const { getByTestId } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    fireEvent.press(getByTestId('thumbgate-promo-open'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(THUMBGATE_WEB_URL);
    });
  });

  it('shows an alert when Linking.openURL fails', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));

    const { getByTestId } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    fireEvent.press(getByTestId('thumbgate-promo-open'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(OPEN_FAIL_TITLE, OPEN_FAIL_MESSAGE);
    });
  });
});
