import {
  COMPOSER_KEYBOARD_GAP,
  COMPOSER_REST_BOTTOM_INSET,
  composerBottomInset,
} from '../utils/composerKeyboard';

describe('composerKeyboard', () => {
  it('adds gap above the keyboard when open', () => {
    expect(composerBottomInset(320, 0)).toBe(320 + COMPOSER_KEYBOARD_GAP);
  });

  it('uses safe-area minimum when keyboard is closed', () => {
    expect(composerBottomInset(0, 34)).toBe(34);
    expect(composerBottomInset(0, 0)).toBe(COMPOSER_REST_BOTTOM_INSET);
  });
});
