import { Platform, Vibration } from 'react-native';

type ExpoHapticsModule = typeof import('expo-haptics');
let expoHaptics: ExpoHapticsModule | null = null;
try {
  expoHaptics = require('expo-haptics');
} catch {
  expoHaptics = null;
}

/** Throttle for stream/WS-driven buzzes (success, warning, light). */
const MIN_REPEAT_MS = 1200;
/** Intentional UI taps (Send, recents) — snappy, not spammy. */
const MIN_TAP_MS = 90;

let lastLightAt = 0;
let lastSelectionAt = 0;
let lastWarningAt = 0;
let lastSuccessAt = 0;
let lastTapAt = 0;

function shouldFire(lastAt: number, minMs: number = MIN_REPEAT_MS): boolean {
  return Date.now() - lastAt >= minMs;
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

async function impactMedium(): Promise<void> {
  if (expoHaptics) {
    try {
      await expoHaptics.impactAsync(expoHaptics.ImpactFeedbackStyle.Medium);
      return;
    } catch {
      // fall through
    }
  }
  vibrateFallback(Platform.OS === 'android' ? 14 : 4);
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
 * UI taps use a shorter gate so Send/recents feel instant on Android and iOS.
 */
export const haptics = {
  light(): void {
    if (!shouldFire(lastLightAt)) return;
    lastLightAt = Date.now();
    impactLight();
  },

  /**
   * Intentional control taps (Send, open thread, Switch Mac).
   * Fires on Android + iOS — unlike the old selection() which was iOS-only.
   */
  tap(): void {
    if (!shouldFire(lastTapAt, MIN_TAP_MS)) return;
    lastTapAt = Date.now();
    impactMedium();
  },

  selection(): void {
    if (!shouldFire(lastSelectionAt)) return;
    lastSelectionAt = Date.now();
    // Android previously skipped selection entirely — felt dead.
    impactLight();
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

/** Test seam — reset throttle clocks between cases. */
export function __resetHapticsForTests(): void {
  lastLightAt = 0;
  lastSelectionAt = 0;
  lastWarningAt = 0;
  lastSuccessAt = 0;
  lastTapAt = 0;
}
