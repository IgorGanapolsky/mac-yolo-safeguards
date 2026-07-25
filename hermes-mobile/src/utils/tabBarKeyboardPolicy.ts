/**
 * When the software keyboard is open, collapse the bottom tab bar only on
 * Chat — the composer needs the vertical space. Settings and Leash keep the
 * tab bar visible so the operator always has an escape hatch (July 2026
 * Material 3 / HIG: never hide primary navigation without a clear dismiss).
 *
 * Android multi-window / PiP invariant (2026-07-25): never collapse when
 * `Keyboard.metrics().height` is 0. Window-inset churn can leave a sticky
 * `keyboardInset > 0` (or react-navigation's own hide-on-keyboard flag)
 * while the IME is closed — tabs must stay visible.
 */
export type TabBarKeyboardCollapseInput = {
  focusedRouteName: string | undefined;
  /** Height from useKeyboardInset (may stick after PiP inset churn). */
  keyboardInset?: number;
  /** Live Keyboard.metrics().height — authoritative "IME open" signal. */
  keyboardMetricsHeight?: number;
};

export function shouldCollapseTabBarForKeyboard(
  focusedRouteNameOrInput: string | undefined | TabBarKeyboardCollapseInput,
  keyboardInset?: number,
  keyboardMetricsHeight?: number,
): boolean {
  const input: TabBarKeyboardCollapseInput =
    typeof focusedRouteNameOrInput === 'object' && focusedRouteNameOrInput !== null
      ? focusedRouteNameOrInput
      : {
          focusedRouteName: focusedRouteNameOrInput,
          keyboardInset,
          keyboardMetricsHeight,
        };

  const inset = input.keyboardInset ?? 0;
  const metricsHeight = input.keyboardMetricsHeight ?? 0;
  // If callers omit metrics (legacy route-only checks), treat as "keyboard
  // open" only for Chat route gating — App.tsx always passes both heights.
  const metricsProvided =
    input.keyboardInset !== undefined || input.keyboardMetricsHeight !== undefined;
  if (metricsProvided && (inset <= 0 || metricsHeight <= 0)) {
    return false;
  }

  return input.focusedRouteName === 'Chat';
}
