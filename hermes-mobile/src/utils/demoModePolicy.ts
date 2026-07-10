import type { GatewaySettings } from '../types/gateway';
import Constants from 'expo-constants';

/**
 * Demo/sandbox is for local dev, E2E automation, and App Store review builds only.
 * Standard release APKs/AABs must not persist or honor demo deep links — they poison real sessions.
 */
export function isStoreReviewDemoBuild(): boolean {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  return (
    process.env.EXPO_PUBLIC_STORE_REVIEW_DEMO === '1' ||
    process.env.EXPO_PUBLIC_STORE_REVIEW_DEMO === 'true' ||
    extra?.storeReviewDemo === true ||
    extra?.storeReviewDemo === 'true' ||
    extra?.storeReviewDemo === '1'
  );
}

export function isDemoModeAllowed(): boolean {
  return __DEV__ || isE2eAutomationBuild() || isStoreReviewDemoBuild();
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

export function isDeveloperLeashUnlockAllowed(): boolean {
  return (
    isDemoModeAllowed() ||
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
