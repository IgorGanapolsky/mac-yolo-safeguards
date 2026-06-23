import { Platform } from 'react-native';

/** Breathing room between the composer and the software keyboard (Material / HIG). */
export const COMPOSER_KEYBOARD_GAP = Platform.select({ ios: 10, android: 12, default: 12 }) ?? 12;

/** Minimum bottom inset when the keyboard is hidden (home indicator / gesture nav). */
export const COMPOSER_REST_BOTTOM_INSET = 12;

export type AndroidKeyboardLayoutMode = 'resize' | 'pan' | string | undefined;

/**
 * Bottom padding for the chat composer dock.
 * - resize + window actually shrank: gap only (OS already lifted the layout).
 * - resize broken or pan mode: full keyboard height + gap.
 */
export function composerBottomInset(
  keyboardInset: number,
  safeBottomInset: number,
  androidKeyboardLayoutMode?: AndroidKeyboardLayoutMode,
  windowShrunk = false,
): number {
  if (keyboardInset > 0) {
    const resizeHandled = androidKeyboardLayoutMode === 'resize' && windowShrunk;
    if (resizeHandled) {
      return COMPOSER_KEYBOARD_GAP + Math.max(safeBottomInset, 0);
    }
    return keyboardInset + COMPOSER_KEYBOARD_GAP;
  }
  return Math.max(safeBottomInset, COMPOSER_REST_BOTTOM_INSET);
}
