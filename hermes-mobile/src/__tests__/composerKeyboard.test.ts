import {
  COMPOSER_KEYBOARD_GAP,
  COMPOSER_REST_BOTTOM_INSET,
  ANDROID_TAB_BAR_ESTIMATE_PX,
  composerBottomInset,
  composerDockInsets,
  detectWindowShrunkForKeyboard,
  focusedAndroidKeyboardFallbackInset,
  keyboardOverlapHeight,
} from '../utils/composerKeyboard';
import { composerDockContainerStyle } from '../screens/ChatScreen';

describe('composerKeyboard', () => {
  it('adds gap above the keyboard when open (pan mode)', () => {
    expect(composerBottomInset(320, 0, 'pan')).toBe(320 + COMPOSER_KEYBOARD_GAP);
  });

  it('only adds gap when Android resize mode shrinks the window', () => {
    expect(composerBottomInset(320, 34, 'resize', true)).toBe(COMPOSER_KEYBOARD_GAP + 34);
  });

  it('lifts manually when resize mode is set but the window did not shrink', () => {
    expect(composerBottomInset(320, 34, 'resize', false)).toBe(320 + COMPOSER_KEYBOARD_GAP);
  });

  it('uses safe-area minimum when keyboard is closed', () => {
    expect(composerBottomInset(0, 34)).toBe(34);
    expect(composerBottomInset(0, 0)).toBe(COMPOSER_REST_BOTTOM_INSET);
  });

  it('prefers screenY overlap when keyboard height is under-reported', () => {
    const overlap = keyboardOverlapHeight(
      { screenX: 0, screenY: 1500, width: 1080, height: 200 },
      2200,
    );
    expect(overlap).toBe(700);
  });

  it('detects resize shrink from baseline window height', () => {
    expect(detectWindowShrunkForKeyboard(360, 2200, 1860)).toBe(true);
    expect(detectWindowShrunkForKeyboard(360, 2200, 2150)).toBe(false);
  });

  it('does not treat partial shrink as resize handled', () => {
    expect(detectWindowShrunkForKeyboard(360, 2200, 2120)).toBe(false);
  });

  it('lifts Android composer via margin even when resize reports shrink', () => {
    const platform = require('react-native').Platform as { OS: string };
    const prevOs = platform.OS;
    platform.OS = 'android';
    try {
      const { paddingBottom, marginBottom } = composerDockInsets(320, 34, 'resize', true, 0);
      expect(paddingBottom).toBe(34);
      expect(marginBottom).toBe(320 + COMPOSER_KEYBOARD_GAP);
    } finally {
      platform.OS = prevOs;
    }
  });

  it('keeps Android composer docked when keyboard inset has been cleared', () => {
    const platform = require('react-native').Platform as { OS: string };
    const prevOs = platform.OS;
    platform.OS = 'android';
    try {
      const { paddingBottom, marginBottom } = composerDockInsets(0, 0, 'resize', false, 0);
      expect(paddingBottom).toBe(COMPOSER_REST_BOTTOM_INSET);
      expect(marginBottom).toBe(0);
    } finally {
      platform.OS = prevOs;
    }
  });

  it('estimates Android keyboard height when focused input has no reported inset', () => {
    expect(focusedAndroidKeyboardFallbackInset(true, 0, 800, 'android')).toBe(336);
    expect(focusedAndroidKeyboardFallbackInset(true, 0, 400, 'android')).toBe(280);
    expect(focusedAndroidKeyboardFallbackInset(true, 0, 1200, 'android')).toBe(360);
  });

  it('does not use Android keyboard fallback when inset is known or input is not focused', () => {
    expect(focusedAndroidKeyboardFallbackInset(true, 280, 800, 'android')).toBe(0);
    expect(focusedAndroidKeyboardFallbackInset(false, 0, 800, 'android')).toBe(0);
    expect(focusedAndroidKeyboardFallbackInset(true, 0, 800, 'ios')).toBe(0);
  });

  it('composer dock container style never uses translateY when marginBottom lifts Android dock', () => {
    const lifted = composerDockContainerStyle('android', {
      paddingBottom: 34,
      marginBottom: 320 + COMPOSER_KEYBOARD_GAP,
    });
    expect(lifted.marginBottom).toBeGreaterThan(0);
    expect(lifted).not.toHaveProperty('transform');
    expect(JSON.stringify(lifted)).not.toContain('translateY');
  });
});
