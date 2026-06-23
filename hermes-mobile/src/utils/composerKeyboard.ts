import { Platform } from 'react-native';

/** Breathing room between the composer and the software keyboard (Material / HIG). */
export const COMPOSER_KEYBOARD_GAP = Platform.select({ ios: 10, android: 12, default: 12 }) ?? 12;

/** Minimum bottom inset when the keyboard is hidden (home indicator / gesture nav). */
export const COMPOSER_REST_BOTTOM_INSET = 12;

/**
 * Bottom padding for the chat composer dock.
 * Uses keyboard height + gap when open; safe-area minimum when closed.
 */
export function composerBottomInset(keyboardInset: number, safeBottomInset: number): number {
  if (keyboardInset > 0) {
    return keyboardInset + COMPOSER_KEYBOARD_GAP;
  }
  return Math.max(safeBottomInset, COMPOSER_REST_BOTTOM_INSET);
}
