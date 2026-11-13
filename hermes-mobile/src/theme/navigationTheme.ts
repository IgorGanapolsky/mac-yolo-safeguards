import { DarkTheme, type Theme } from '@react-navigation/native';
import { colors } from './colors';

// Typed as Theme so a React Navigation upgrade that adds a required field fails here, not in App.tsx.
export const NavigationTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    primary: colors.primary,
    background: colors.backgroundStart,
    card: 'rgba(9, 11, 20, 0.94)',
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};
