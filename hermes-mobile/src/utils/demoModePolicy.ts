import type { GatewaySettings } from '../types/gateway';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * CEO 2026-08-03: ZERO DEMO FOREVER for real users and store binaries.
 *
 * Demo is banned on production / App Store / TestFlight / release APKs.
 * The only carve-out is explicit E2E automation builds (EXPO_PUBLIC_E2E_AUTOMATION=1)
 * used by Maestro on agent machines — never shipped to customers.
 *
 * Store-review demo (EXPO_PUBLIC_STORE_REVIEW_DEMO) is permanently retired.
 */

/** @deprecated Always false — store-review demo removed 2026-08-03 (CEO: zero demo forever). */
export function isStoreReviewDemoBuild(): boolean {
  return false;
}

export function isE2eAutomationBuild(): boolean {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  return (
    process.env.EXPO_PUBLIC_E2E_AUTOMATION === '1' ||
    process.env.EXPO_PUBLIC_E2E_AUTOMATION === 'true' ||
    extra?.e2eAutomation === true ||
    extra?.e2eAutomation === 'true' ||
    extra?.e2eAutomation === '1'
  );
}

/** Demo allowed ONLY on explicit E2E automation builds — never store, never casual __DEV__. */
export function isDemoModeAllowed(): boolean {
  return isE2eAutomationBuild();
}

export function isDeveloperLeashUnlockAllowed(): boolean {
  return (
    isE2eAutomationBuild() ||
    process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK === '1' ||
    process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK === 'true'
  );
}

export function sanitizeDemoModeForRelease(settings: GatewaySettings): GatewaySettings {
  if (!isDemoModeAllowed() && settings.demoMode) {
    return { ...settings, demoMode: false };
  }
  return settings;
}
