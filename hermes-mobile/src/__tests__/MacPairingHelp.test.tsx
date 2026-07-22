import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import MacPairingHelp from '../components/MacPairingHelp';

describe('MacPairingHelp ThumbGate cross-promotion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens thumbgate.app from the compact getting-started help', () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByTestId, getByText } = render(
      <MacPairingHelp variant="getting-started" compact />,
    );

    expect(getByText('Open Hermes Web at ThumbGate.app →')).toBeTruthy();
    fireEvent.press(getByTestId('thumbgate-web-link'));

    expect(openUrl).toHaveBeenCalledWith(
      'https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=cross_promo',
    );
  });

  it('does not show the web link while scanning a pairing QR', () => {
    const { queryByTestId } = render(<MacPairingHelp variant="qr-pairing" compact />);
    expect(queryByTestId('thumbgate-web-link')).toBeNull();
  });
});
