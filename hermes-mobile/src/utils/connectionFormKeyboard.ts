import {
  COMPOSER_KEYBOARD_GAP,
  focusedAndroidKeyboardFallbackInset,
} from './composerKeyboard';

export type ConnectionFormKeyboardPaddingInput = {
  keyboardInset: number;
  inputFocused: boolean;
  windowHeight: number;
  /** True when adjustResize already absorbed most of the IME height. */
  windowShrunk?: boolean;
};

/**
 * Bottom padding / sticky-footer lift for Connect Mac / connection panels.
 * Absolute overlays often sit under Gboard even when `softwareKeyboardLayoutMode`
 * is `resize`, so we still add a manual lift when the window did not shrink.
 */
export function connectionFormKeyboardPadding(
  input: ConnectionFormKeyboardPaddingInput,
): number {
  const reported =
    input.keyboardInset > 0
      ? input.keyboardInset
      : focusedAndroidKeyboardFallbackInset(
          input.inputFocused,
          input.keyboardInset,
          input.windowHeight,
        );
  if (reported <= 0) {
    return 0;
  }
  if (input.windowShrunk) {
    return COMPOSER_KEYBOARD_GAP;
  }
  return reported + COMPOSER_KEYBOARD_GAP;
}

/** True when a connection form TextInput must not auto-open the IME. */
export function connectionFormMustNotAutoFocus(autoFocus?: boolean): boolean {
  return autoFocus !== true;
}
