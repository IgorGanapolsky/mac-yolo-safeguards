import { shouldCollapseTabBarForKeyboard } from '../utils/tabBarKeyboardPolicy';

describe('shouldCollapseTabBarForKeyboard', () => {
  it('collapses only on Chat so the composer can use the space', () => {
    expect(shouldCollapseTabBarForKeyboard('Chat')).toBe(true);
  });

  it('keeps the tab bar on Settings and Leash (escape hatch)', () => {
    expect(shouldCollapseTabBarForKeyboard('Settings')).toBe(false);
    expect(shouldCollapseTabBarForKeyboard('Leash')).toBe(false);
  });

  it('defaults to visible when the focused route is unknown', () => {
    expect(shouldCollapseTabBarForKeyboard(undefined)).toBe(false);
    expect(shouldCollapseTabBarForKeyboard('')).toBe(false);
  });
});
