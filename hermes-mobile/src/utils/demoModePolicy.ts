import type { GatewaySettings } from '../types/gateway';

/**
 * Demo/sandbox is for local dev and E2E automation builds only.
 * Release APKs must not persist or honor demo deep links — they poison real sessions.
 */
export function isDemoModeAllowed(): boolean {
  return (
    __DEV__ ||
    isE2eAutomationBuild()
  );
}

export function isE2eAutomationBuild(): boolean {
  return (
    process.env.EXPO_PUBLIC_E2E_AUTOMATION === '1' ||
    process.env.EXPO_PUBLIC_E2E_AUTOMATION === 'true'
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
