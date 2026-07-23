import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import OtaUpdateBanner from '../components/OtaUpdateBanner';
import { OTA_BANNER_MIN_TAP_PT } from '../utils/otaBannerLayout';

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 47, left: 0, right: 0, bottom: 34 }),
  };
});

jest.mock('../context/GatewayContext', () => ({
  useGateway: () => ({
    bootstrapReady: true,
    gatewayProfiles: [{ id: 'mac', gatewayUrl: 'http://192.168.1.1:8787', apiKey: 'k' }],
  }),
}));

const mockDismiss = jest.fn();
const mockApplyNow = jest.fn().mockResolvedValue(undefined);

jest.mock('../hooks/useOtaUpdateBanner', () => ({
  useOtaUpdateBanner: () => ({
    state: 'pending',
    message: 'A new version of Hermes is downloaded and ready.',
    dismiss: mockDismiss,
    applyNow: mockApplyNow,
  }),
}));

function resolveStyle(style: unknown): Record<string, unknown> {
  if (typeof style === 'function') {
    return Object.assign({}, ...[].concat(style({ pressed: false })).filter(Boolean));
  }
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean));
  }
  return (style as Record<string, unknown>) || {};
}

describe('OtaUpdateBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pads below the status-bar inset so Restart/dismiss stay tappable', () => {
    const { getByTestId } = render(<OtaUpdateBanner />);
    const banner = getByTestId('ota-update-banner');
    expect(resolveStyle(banner.props.style).paddingTop).toBe(47 + 10);
  });

  it('exposes ≥44pt Restart and dismiss targets', () => {
    const { getByTestId } = render(<OtaUpdateBanner />);
    for (const id of ['ota-update-apply', 'ota-update-dismiss'] as const) {
      const resolved = resolveStyle(getByTestId(id).props.style);
      expect(resolved.minHeight).toBeGreaterThanOrEqual(OTA_BANNER_MIN_TAP_PT);
      expect(resolved.minWidth).toBeGreaterThanOrEqual(OTA_BANNER_MIN_TAP_PT);
    }
  });

  it('wires Restart and dismiss presses', () => {
    const { getByTestId } = render(<OtaUpdateBanner />);
    fireEvent.press(getByTestId('ota-update-apply'));
    expect(mockApplyNow).toHaveBeenCalled();
    fireEvent.press(getByTestId('ota-update-dismiss'));
    expect(mockDismiss).toHaveBeenCalled();
  });
});
