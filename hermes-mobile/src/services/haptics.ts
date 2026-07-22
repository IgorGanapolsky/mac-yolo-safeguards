import { Platform, Vibration } from 'react-native';

type ExpoHapticsModule = typeof import('expo-haptics');
let expoHaptics: ExpoHapticsModule | null = null;
try {
  expoHaptics = require('expo-haptics');
} catch {
  expoHaptics = null;
}

/**
 * Haptic policy (2026-07-22 P0):
 * - Event-driven only (send / connect edge / approval / explicit tap).
 * - Never allow ~1s buzz storms from Waiting elapsed ticks, health polls,
 *   or ChatScreen fail effects that re-run when `runProgress.detail` updates.
 */
const MIN_GLOBAL_MS = 1_500;
const MIN_LIGHT_MS = 2_000;
const MIN_SELECTION_MS = 400;
const MIN_SUCCESS_MS = 8_000;
const MIN_WARNING_MS = 30_000;
const MIN_CONNECTION_MS = 60_000;
const MIN_HEAVY_MS = 10_000;

let lastAnyAt = 0;
let lastLightAt = 0;
let lastSelectionAt = 0;
let lastWarningAt = 0;
let lastSuccessAt = 0;
let lastConnectionAt = 0;
let lastHeavyAt = 0;

function shouldFire(lastAt: number, minimumInterval: number): boolean {
  const now = Date.now();
  if (now - lastAnyAt < MIN_GLOBAL_MS) {
    return false;
  }
  return now - lastAt >= minimumInterval;
}

function markFired(setter: (at: number) => void): void {
  const now = Date.now();
  lastAnyAt = now;
  setter(now);
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

export const haptics = {
  /**
   * Connection health / sign-of-life. Background reconnect flaps must not buzz.
   */
  connection(): void {
    if (!shouldFire(lastConnectionAt, MIN_CONNECTION_MS)) return;
    markFired((at) => {
      lastConnectionAt = at;
    });
    impactLight();
  },

  light(): void {
    if (!shouldFire(lastLightAt, MIN_LIGHT_MS)) return;
    markFired((at) => {
      lastLightAt = at;
    });
    impactLight();
  },

  selection(): void {
    if (!shouldFire(lastSelectionAt, MIN_SELECTION_MS)) return;
    markFired((at) => {
      lastSelectionAt = at;
    });
    if (Platform.OS === 'ios') {
      impactLight();
    }
  },

  success(): void {
    if (!shouldFire(lastSuccessAt, MIN_SUCCESS_MS)) return;
    markFired((at) => {
      lastSuccessAt = at;
    });
    notify('success');
  },

  warning(): void {
    if (!shouldFire(lastWarningAt, MIN_WARNING_MS)) return;
    markFired((at) => {
      lastWarningAt = at;
    });
    notify('warning');
  },

  heavy(): void {
    if (!shouldFire(lastHeavyAt, MIN_HEAVY_MS)) return;
    markFired((at) => {
      lastHeavyAt = at;
    });
    if (expoHaptics) {
      expoHaptics.impactAsync(expoHaptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      return;
    }
    vibrateFallback(Platform.OS === 'android' ? 35 : 12);
  },
};

/** Jest-only: clear throttle clocks between cases. */
export function resetHapticsForTests(): void {
  lastAnyAt = 0;
  lastLightAt = 0;
  lastSelectionAt = 0;
  lastWarningAt = 0;
  lastSuccessAt = 0;
  lastConnectionAt = 0;
  lastHeavyAt = 0;
}
