import React from 'react';
import { Alert, Linking, Share } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ThumbGatePromoCard, {
  OPEN_FAIL_MESSAGE,
  OPEN_FAIL_TITLE,
} from '../components/ThumbGatePromoCard';
import { trackProductEvent } from '../services/productAnalytics';
import { THUMBGATE_WEB_URL } from '../utils/thumbgatePromoCopy';
import { THUMBGATE_CONNECTOR_INSTALL_COMMAND } from '../utils/thumbgateFacilitation';

jest.mock('../services/productAnalytics', () => ({
  trackProductEvent: jest.fn(() => Promise.resolve()),
}));

describe('ThumbGatePromoCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders facilitation steps and opens ThumbGate.app with analytics', async () => {
    const { getByTestId, getByText } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    expect(getByTestId('thumbgate-promo-connection_unreachable')).toBeTruthy();
    expect(getByText('No ThumbGate.app yet?')).toBeTruthy();
    expect(getByText('Open ThumbGate.app Dashboard')).toBeTruthy();
    expect(getByTestId('thumbgate-facilitation-steps')).toBeTruthy();
    expect(getByTestId('thumbgate-connector-install-command').props.children).toBe(
      THUMBGATE_CONNECTOR_INSTALL_COMMAND,
    );
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

  it('shares the Mac one-line installer (Herdr-style facilitate path)', async () => {
    const { getByTestId } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    fireEvent.press(getByTestId('thumbgate-promo-share-installer'));

    await waitFor(() => {
      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({
          message: THUMBGATE_CONNECTOR_INSTALL_COMMAND,
        }),
      );
      expect(trackProductEvent).toHaveBeenCalledWith('thumbgate_promo_tap', {
        surface: 'connection_unreachable',
        action: 'share_connector_install',
      });
    });
  });

  // 2026-08-03 user-panic report: "Installer shared" + "Share Mac installer" was
  // read as "you are sharing my machine with the whole world". The share payload
  // is a public command string only. Copy must never let that reading stand.
  it('never implies the Mac itself is shared, before or after sharing', async () => {
    const { getByTestId, queryByText } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    const shareButton = getByTestId('thumbgate-promo-share-installer');
    expect(shareButton).toHaveTextContent('Share install command');
    expect(queryByText(/Share Mac installer/i)).toBeNull();

    // The scope clarifier must state what is and is not shared.
    const note = getByTestId('thumbgate-share-scope-note').props.children as string;
    expect(note).toMatch(/text command/i);
    expect(note).toMatch(/not your Mac/i);

    fireEvent.press(shareButton);

    await waitFor(() => {
      expect(shareButton).toHaveTextContent('Install command shared');
    });
    // The bare word "Installer shared" (machine reading) must never render.
    expect(queryByText(/^Installer shared$/)).toBeNull();
  });

  it('shares only the public command text — no host, address, or credential', async () => {
    const { getByTestId } = render(
      <ThumbGatePromoCard surface="connection_unreachable" />,
    );

    fireEvent.press(getByTestId('thumbgate-promo-share-installer'));

    await waitFor(() => {
      expect(Share.share).toHaveBeenCalled();
    });
    const payload = (Share.share as jest.Mock).mock.calls[0][0];
    const serialized = JSON.stringify(payload);
    expect(payload.message).toBe(THUMBGATE_CONNECTOR_INSTALL_COMMAND);
    // Nothing machine-identifying may ride along in the share sheet.
    expect(serialized).not.toMatch(/ts\.net|100\.\d+\.\d+\.\d+|192\.168\.|localhost|127\.0\.0\.1/i);
    expect(serialized).not.toMatch(/token|apiKey|api_key|secret|Bearer/i);
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
