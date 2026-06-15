import { Vibration, Platform } from 'react-native';

/** Cross-platform haptic feedback (LipoShield pattern). */
export const haptics = {
  light(): void {
    if (Platform.OS === 'android') {
      Vibration.vibrate(8);
    } else {
      Vibration.vibrate([0, 1]);
    }
  },

  selection(): void {
    if (Platform.OS === 'android') {
      Vibration.vibrate(15);
    } else {
      Vibration.vibrate(2);
    }
  },

  success(): void {
    Vibration.vibrate([0, 15, 60, 20]);
  },

  warning(): void {
    Vibration.vibrate([0, 25, 40, 35]);
  },

  heavy(): void {
    if (Platform.OS === 'android') {
      Vibration.vibrate(35);
    } else {
      Vibration.vibrate(12);
    }
  },
};
