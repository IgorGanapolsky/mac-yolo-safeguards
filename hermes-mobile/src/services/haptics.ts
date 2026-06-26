import { Platform, Vibration } from 'react-native';

type ExpoHapticsModule = typeof import('expo-haptics');
let expoHaptics: ExpoHapticsModule | null = null;
try {
  expoHaptics = require('expo-haptics');
} catch {
  expoHaptics = null;
}

const MIN_REPEAT_MS = 1200;
let lastLightAt = 0;
let lastSelectionAt = 0;
let lastWarningAt = 0;
let lastSuccessAt = 0;

function shouldFire(lastAt: number): boolean {
  return Date.now() - lastAt >= MIN_REPEAT_MS;
}

function vibrateFallback(pattern: number | number[]): void {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    Vibration.vibrate(pattern);
  } catch {
    // ignore
  }
}

async function impactLight(): Promise<void> {
  if (expoHaptics) {
    try {
      await expoHaptics.impactAsync(expoHaptics.ImpactFeedbackStyle.Light);
      return;
    } catch {
      // fall through
    }
  }
  vibrateFallback(Platform.OS === 'android' ? 8 : 1);
}

async function notify(type: 'success' | 'warning'): Promise<void> {
  if (expoHaptics) {
    try {
      await expoHaptics.notificationAsync(
        type === 'success'
          ? expoHaptics.NotificationFeedbackType.Success
          : expoHaptics.NotificationFeedbackType.Warning,
      );
      return;
    } catch {
      // fall through
    }
  }
  vibrateFallback(type === 'success' ? [0, 15, 60, 20] : [0, 25, 40, 35]);
}

/**
 * Haptic policy (2026): meaningful events only, throttled — no buzz storms from WS duplicates.
 */
export const haptics = {
  light(): void {
    if (!shouldFire(lastLightAt)) return;
    lastLightAt = Date.now();
    impactLight();
  },

  selection(): void {
    if (!shouldFire(lastSelectionAt)) return;
    lastSelectionAt = Date.now();
    if (Platform.OS === 'ios') {
      impactLight();
    }
  },

  success(): void {
    if (!shouldFire(lastSuccessAt)) return;
    lastSuccessAt = Date.now();
    notify('success');
  },

  warning(): void {
    if (!shouldFire(lastWarningAt)) return;
    lastWarningAt = Date.now();
    notify('warning');
  },

  heavy(): void {
    if (expoHaptics) {
      expoHaptics.impactAsync(expoHaptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      return;
    }
    vibrateFallback(Platform.OS === 'android' ? 35 : 12);
  },
};
