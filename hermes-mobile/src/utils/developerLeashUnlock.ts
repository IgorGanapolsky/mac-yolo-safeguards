import type { GatewaySettings } from '../types/gateway';
import { isDeveloperLeashUnlockAllowed } from './demoModePolicy';

/** Long-press duration on the Leash tab title to trigger developer unlock. */
export const LEASH_TITLE_DEV_UNLOCK_LONG_PRESS_MS = 8000;

/** Persisted Igor backdoor — unlocks Leash without IAP (set via gesture, deep link, or dev tools). */
export function isDeveloperLeashBackdoorActive(settings: GatewaySettings): boolean {
  return settings.developerLeashUnlock === true;
}

/** Build-flag gate for deep links, demo auto-unlock, and tab-tap backdoor — not the 8s title hold. */
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
