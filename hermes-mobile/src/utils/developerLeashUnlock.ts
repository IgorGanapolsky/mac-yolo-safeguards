import type { GatewaySettings } from '../types/gateway';
import { isDeveloperLeashUnlockAllowed } from './demoModePolicy';

/** Persisted Igor backdoor — unlocks Leash without IAP (set via gesture, deep link, or dev tools). */
export function isDeveloperLeashBackdoorActive(settings: GatewaySettings): boolean {
  return settings.developerLeashUnlock === true;
}

export function canUseDeveloperLeashBackdoor(): boolean {
  return isDeveloperLeashUnlockAllowed();
}

export function withDeveloperLeashUnlocked(settings: GatewaySettings): GatewaySettings {
  return { ...settings, developerLeashUnlock: true };
}

export function isDevLeashUnlockDeepLink(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('dev/leash-unlock') || lower.includes('dev-leash-unlock');
}
