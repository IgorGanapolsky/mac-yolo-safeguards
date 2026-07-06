import { Platform, type KeyboardEvent } from 'react-native';

/**
 * Breathing room between the composer and the software keyboard.
 * Material 3 recommends ~16dp; iOS HIG ~8–12pt above the keyboard guide.
 */
export const COMPOSER_KEYBOARD_GAP = Platform.select({ ios: 12, android: 16, default: 16 }) ?? 16;

/** Minimum bottom inset when the keyboard is hidden (home indicator / gesture nav). */
export const COMPOSER_REST_BOTTOM_INSET = 12;

/** Bottom tab bar footprint (must match App.tsx navBar — used for keyboard lift math). */
export const ANDROID_TAB_BAR_ESTIMATE_PX = 64;

/** Cap composer dock height so banners + vault strips cannot consume half the screen. */
export const COMPOSER_DOCK_MAX_HEIGHT_RATIO = 0.34;

export function composerDockMaxHeight(windowHeight: number): number {
  if (windowHeight <= 0) {
    return 280;
  }
  return Math.max(180, Math.round(windowHeight * COMPOSER_DOCK_MAX_HEIGHT_RATIO));
}

const ANDROID_KEYBOARD_FALLBACK_RATIO = 0.42;
const ANDROID_KEYBOARD_FALLBACK_MIN_PX = 280;
const ANDROID_KEYBOARD_FALLBACK_MAX_PX = 360;

export type ComposerDockInsets = {
  paddingBottom: number;
  /** Lifts the whole composer dock above the keyboard without reflowing the TextInput. */
  marginBottom: number;
};

export type AndroidKeyboardLayoutMode = 'resize' | 'pan' | string | undefined;

type KeyboardCoordinates = KeyboardEvent['endCoordinates'];

/**
 * How much of the window the keyboard covers (px), using screenY when available.
 * RN 0.83+ reports more reliable coordinates on Android edge-to-edge.
 */
export function keyboardOverlapHeight(
  coords: KeyboardCoordinates | undefined,
  windowHeight: number,
): number {
  if (!coords) {
    return 0;
  }
  const reportedHeight = coords.height ?? 0;
  if (coords.screenY > 0 && windowHeight > 0) {
    const overlapFromScreenY = windowHeight - coords.screenY;
    if (overlapFromScreenY > 80) {
      return Math.max(overlapFromScreenY, reportedHeight);
    }
  }
  return reportedHeight;
}

export function windowHeightShrink(baselineHeight: number, currentWindowHeight: number): number {
  return Math.max(0, baselineHeight - currentWindowHeight);
}

export function detectWindowShrunkForKeyboard(
  keyboardInset: number,
  baselineWindowHeight: number,
  currentWindowHeight: number,
): boolean {
  if (keyboardInset <= 0) {
    return false;
  }
  const shrink = windowHeightShrink(baselineWindowHeight, currentWindowHeight);
  // Require most of the keyboard overlap to be absorbed by adjustResize. A tiny shrink
  // (status bar / IME shim) must not skip manual composer lift on Android dev clients.
  const minShrink = Math.max(56, keyboardInset * 0.7);
  return shrink >= minShrink;
}

/**
 * Android can report a zero keyboard inset in edge-to-edge / pan layouts while Gboard
 * still overlays the composer. When the TextInput is focused, estimate a conservative
 * keyboard height so the send box remains usable instead of hiding behind the IME.
 */
export function focusedAndroidKeyboardFallbackInset(
  inputFocused: boolean,
  keyboardInset: number,
  windowHeight: number,
  platformOs = Platform.OS,
): number {
  if (platformOs !== 'android' || !inputFocused || keyboardInset > 0 || windowHeight <= 0) {
    return 0;
  }
  return Math.min(
    ANDROID_KEYBOARD_FALLBACK_MAX_PX,
    Math.max(
      ANDROID_KEYBOARD_FALLBACK_MIN_PX,
      Math.round(windowHeight * ANDROID_KEYBOARD_FALLBACK_RATIO),
    ),
  );
}

/**
 * @deprecated Use detectWindowShrunkForKeyboard — kept for tests naming clarity.
 */
export function isKeyboardResizeHandled(
  androidKeyboardLayoutMode: AndroidKeyboardLayoutMode | undefined,
  keyboardInset: number,
  baselineWindowHeight: number,
  currentWindowHeight: number,
): boolean {
  if (androidKeyboardLayoutMode !== 'resize') {
    return false;
  }
  return detectWindowShrunkForKeyboard(keyboardInset, baselineWindowHeight, currentWindowHeight);
}

/**
 * Bottom padding for the chat composer dock.
 * - resize + window actually shrank: gap only (OS already lifted the layout).
 * - resize broken or pan mode: full keyboard overlap + gap.
 */
export function composerBottomInset(
  keyboardInset: number,
  safeBottomInset: number,
  androidKeyboardLayoutMode?: AndroidKeyboardLayoutMode,
  windowShrunk = false,
): number {
  return composerDockInsets(
    keyboardInset,
    safeBottomInset,
    androidKeyboardLayoutMode,
    windowShrunk,
  ).paddingBottom;
}

/**
 * Composer dock spacing for software keyboard.
 * On Android pan/dev-client layouts, marginBottom lifts the dock; paddingBottom stays small
 * so the TextInput does not reflow and lose focus.
 */
export function composerDockInsets(
  keyboardInset: number,
  safeBottomInset: number,
  androidKeyboardLayoutMode?: AndroidKeyboardLayoutMode,
  windowShrunk = false,
  tabBarOccupiedPx = ANDROID_TAB_BAR_ESTIMATE_PX,
): ComposerDockInsets {
  const restPadding = Math.max(safeBottomInset, COMPOSER_REST_BOTTOM_INSET);
  if (keyboardInset <= 0) {
    return { paddingBottom: restPadding, marginBottom: 0 };
  }

  const resizeHandled = androidKeyboardLayoutMode === 'resize' && windowShrunk;
  if (resizeHandled && Platform.OS !== 'android') {
    return {
      paddingBottom: COMPOSER_KEYBOARD_GAP + Math.max(safeBottomInset, 0),
      marginBottom: 0,
    };
  }

  if (Platform.OS === 'android' && keyboardInset > 0) {
    const resizeHandled = androidKeyboardLayoutMode === 'resize' && windowShrunk;
    if (resizeHandled) {
      return {
        paddingBottom: Math.max(restPadding, COMPOSER_KEYBOARD_GAP),
        marginBottom: 0,
      };
    }
    const marginBottom = Math.max(
      0,
      keyboardInset + COMPOSER_KEYBOARD_GAP - tabBarOccupiedPx,
    );
    return { paddingBottom: restPadding, marginBottom };
  }

  return {
    paddingBottom: keyboardInset + COMPOSER_KEYBOARD_GAP,
    marginBottom: 0,
  };
}
