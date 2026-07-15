import { Platform } from 'react-native';
import {
  connectionFormKeyboardPadding,
  connectionFormMustNotAutoFocus,
} from '../utils/connectionFormKeyboard';
import { COMPOSER_KEYBOARD_GAP } from '../utils/composerKeyboard';

describe('connectionFormKeyboard', () => {
  it('returns 0 when the keyboard is hidden and the field is not focused', () => {
    expect(
      connectionFormKeyboardPadding({
        keyboardInset: 0,
        inputFocused: false,
        windowHeight: 800,
      }),
    ).toBe(0);
  });

  it('lifts by inset + gap when Android did not shrink the window', () => {
    expect(
      connectionFormKeyboardPadding({
        keyboardInset: 300,
        inputFocused: true,
        windowHeight: 800,
        windowShrunk: false,
      }),
    ).toBe(300 + COMPOSER_KEYBOARD_GAP);
  });

  it('only adds a gap when adjustResize already absorbed the IME', () => {
    expect(
      connectionFormKeyboardPadding({
        keyboardInset: 300,
        inputFocused: true,
        windowHeight: 500,
        windowShrunk: true,
      }),
    ).toBe(COMPOSER_KEYBOARD_GAP);
  });

  it('uses the Android focused fallback when inset is 0 but the field is focused', () => {
    const platform = Platform as { OS: string };
    const prev = platform.OS;
    platform.OS = 'android';
    try {
      const pad = connectionFormKeyboardPadding({
        keyboardInset: 0,
        inputFocused: true,
        windowHeight: 800,
        windowShrunk: false,
      });
      expect(pad).toBeGreaterThanOrEqual(280 + COMPOSER_KEYBOARD_GAP);
    } finally {
      platform.OS = prev;
    }
  });

  it('forbids autoFocus on connection forms', () => {
    expect(connectionFormMustNotAutoFocus(undefined)).toBe(true);
    expect(connectionFormMustNotAutoFocus(false)).toBe(true);
    expect(connectionFormMustNotAutoFocus(true)).toBe(false);
  });
});
