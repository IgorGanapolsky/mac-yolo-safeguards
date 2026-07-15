/**
 * When the software keyboard is open, collapse the bottom tab bar only on
 * Chat — the composer needs the vertical space. Settings and Leash keep the
 * tab bar visible so the operator always has an escape hatch (July 2026
 * Material 3 / HIG: never hide primary navigation without a clear dismiss).
 */
export function shouldCollapseTabBarForKeyboard(
  focusedRouteName: string | undefined,
): boolean {
  return focusedRouteName === 'Chat';
}
