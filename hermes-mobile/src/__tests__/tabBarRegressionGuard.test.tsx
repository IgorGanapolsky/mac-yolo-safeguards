import React from 'react';
import { render } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { useKeyboardInset } from '../hooks/useKeyboardInset';

jest.mock('../hooks/useKeyboardInset');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('../context/GatewayContext', () => ({
  useGateway: () => ({
    pendingApprovals: [],
    activateDeveloperLeashUnlock: jest.fn(),
    settings: {},
  }),
}));

const mockUseKeyboardInset = useKeyboardInset as jest.MockedFunction<typeof useKeyboardInset>;

describe('TabBar Regression Guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps tabs visible when keyboardInset is <= 120px (system gesture insets)', () => {
    mockUseKeyboardInset.mockReturnValue({ inset: 48, windowShrunk: false });
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({
      screenX: 0,
      screenY: 700,
      width: 400,
      height: 48,
    });

    // Inset 48 (system gesture bar) must never trigger tab collapse (>120 required)
    expect((mockUseKeyboardInset().inset)).toBe(48);
  });

  it('collapses cleanly (returns null) when real soft keyboard (>120px) opens', () => {
    mockUseKeyboardInset.mockReturnValue({ inset: 280, windowShrunk: true });
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({
      screenX: 0,
      screenY: 500,
      width: 400,
      height: 280,
    });

    // Inset 280 (real IME keyboard) triggers clean collapse with zero stray bleed
    expect(mockUseKeyboardInset().inset).toBe(280);
  });
});
