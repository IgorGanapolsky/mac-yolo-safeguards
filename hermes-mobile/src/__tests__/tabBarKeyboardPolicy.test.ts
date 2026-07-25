import { shouldCollapseTabBarForKeyboard } from '../utils/tabBarKeyboardPolicy';

describe('shouldCollapseTabBarForKeyboard', () => {
  it('collapses only on Chat when the keyboard is truly open', () => {
    expect(
      shouldCollapseTabBarForKeyboard({
        focusedRouteName: 'Chat',
        keyboardInset: 280,
        keyboardMetricsHeight: 280,
      }),
    ).toBe(true);
    expect(shouldCollapseTabBarForKeyboard('Chat', 280, 280)).toBe(true);
  });

  it('keeps the tab bar on Settings and Leash even with keyboard open', () => {
    expect(
      shouldCollapseTabBarForKeyboard({
        focusedRouteName: 'Settings',
        keyboardInset: 280,
        keyboardMetricsHeight: 280,
      }),
    ).toBe(false);
    expect(shouldCollapseTabBarForKeyboard('Leash', 280, 280)).toBe(false);
  });

  it('defaults to visible when the focused route is unknown', () => {
    expect(shouldCollapseTabBarForKeyboard(undefined, 280, 280)).toBe(false);
    expect(shouldCollapseTabBarForKeyboard('', 280, 280)).toBe(false);
  });

  it('never collapses when Keyboard.metrics height is 0 (sticky inset / PiP)', () => {
    // Android multi-window/PiP can leave useKeyboardInset sticky while IME is closed.
    expect(
      shouldCollapseTabBarForKeyboard({
        focusedRouteName: 'Chat',
        keyboardInset: 320,
        keyboardMetricsHeight: 0,
      }),
    ).toBe(false);
    expect(shouldCollapseTabBarForKeyboard('Chat', 320, 0)).toBe(false);
  });

  it('never collapses when keyboardInset is 0 even if metrics report height', () => {
    expect(
      shouldCollapseTabBarForKeyboard({
        focusedRouteName: 'Chat',
        keyboardInset: 0,
        keyboardMetricsHeight: 280,
      }),
    ).toBe(false);
  });

  it('legacy route-only call still gates Chat vs other tabs', () => {
    expect(shouldCollapseTabBarForKeyboard('Chat')).toBe(true);
    expect(shouldCollapseTabBarForKeyboard('Settings')).toBe(false);
  });
});
