import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import ThumbGatePickerEscapeHatch from '../components/ThumbGatePickerEscapeHatch';
import ManualComputerAddressForm from '../components/ManualComputerAddressForm';
import { trackProductEvent } from '../services/productAnalytics';
import {
  THUMBGATE_PICKER_ESCAPE_LABEL,
  THUMBGATE_WEB_URL,
  thumbGatePromoCopy,
} from '../utils/thumbgatePromoCopy';

jest.mock('../services/productAnalytics', () => ({
  trackProductEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/manualGatewayConnection', () => ({
  connectManualGatewayAddress: jest.fn(async ({ persistProfile, gatewayUrl, fallbackLabel }) => {
    await persistProfile(fallbackLabel, gatewayUrl);
  }),
}));

describe('ThumbGatePickerEscapeHatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes a web escape hatch that opens thumbgate.app with shared UTM params', async () => {
    const copy = thumbGatePromoCopy('computer_picker');
    expect(copy.buttonLabel).toBe(THUMBGATE_PICKER_ESCAPE_LABEL);
    expect(copy.url).toBe(THUMBGATE_WEB_URL);

    const { getByTestId, getByText } = render(<ThumbGatePickerEscapeHatch />);

    expect(getByTestId('thumbgate-picker-escape-hatch')).toBeTruthy();
    expect(getByText(THUMBGATE_PICKER_ESCAPE_LABEL)).toBeTruthy();
    expect(getByText(/Prefer the browser/i)).toBeTruthy();
    expect(trackProductEvent).toHaveBeenCalledWith('thumbgate_promo_view', {
      surface: 'computer_picker',
    });

    fireEvent.press(getByTestId('thumbgate-picker-escape-open'));

    await waitFor(() => {
      expect(trackProductEvent).toHaveBeenCalledWith('thumbgate_promo_tap', {
        surface: 'computer_picker',
        url: THUMBGATE_WEB_URL,
      });
      expect(Linking.openURL).toHaveBeenCalledWith(THUMBGATE_WEB_URL);
    });
  });

  it('renders inside Choose computer ManualComputerAddressForm pickerMode only', () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <ManualComputerAddressForm onAddProfile={jest.fn()} testIDPrefix="mac-picker-manual" />,
    );
    expect(queryByTestId('thumbgate-picker-escape-hatch')).toBeNull();

    rerender(
      <ManualComputerAddressForm
        onAddProfile={jest.fn()}
        pickerMode
        testIDPrefix="mac-picker-manual"
      />,
    );
    expect(getByTestId('thumbgate-picker-escape-hatch')).toBeTruthy();
    expect(getByTestId('thumbgate-picker-escape-open')).toBeTruthy();
  });
});
