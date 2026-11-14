import { DarkTheme } from '@react-navigation/native';
import { NavigationTheme } from '../theme/navigationTheme';
import { colors } from '../theme/colors';

describe('NavigationTheme', () => {
  it('keeps the fonts React Navigation requires', () => {
    expect(NavigationTheme.fonts).toEqual(DarkTheme.fonts);
  });

  it('uses the app colors on a dark theme', () => {
    expect(NavigationTheme.dark).toBe(true);
    expect(NavigationTheme.colors.primary).toBe(colors.primary);
    expect(NavigationTheme.colors.background).toBe(colors.backgroundStart);
  });
});
