import {
  COMPOSER_KEYBOARD_GAP,
  COMPOSER_REST_BOTTOM_INSET,
  composerBottomInset,
} from '../utils/composerKeyboard';

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
});
