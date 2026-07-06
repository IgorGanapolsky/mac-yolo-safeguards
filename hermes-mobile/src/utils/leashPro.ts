import type { GatewaySettings } from '../types/gateway';
import { storage } from '../services/storage';
import { isDeveloperLeashBackdoorActive } from './developerLeashUnlock';

/** Leash Pro — unlocks standing gate rule management (IAP or dev toggle). */
export function isLeashProEnabled(settings: GatewaySettings): boolean {
  if (settings.thumbgateProActive === true) {
    return true;
  }
  if (isDeveloperLeashBackdoorActive(settings)) {
    return true;
  }
  return false;
}

/** AsyncStorage-backed entitlement mirrors `thumbgateProActive` in gateway settings. */
export function withLeashProEnabled(settings: GatewaySettings): GatewaySettings {
  return { ...settings, thumbgateProActive: true };
}

export function withLeashProDisabled(settings: GatewaySettings): GatewaySettings {
  return { ...settings, thumbgateProActive: false, developerLeashUnlock: false };
}

/** Read persisted Leash Pro entitlement from AsyncStorage gateway settings. */
export async function readLeashProEntitlementFromStorage(): Promise<boolean> {
  const settings = await storage.loadGatewaySettings();
  return isLeashProEnabled(settings);
}

/** Persist Leash Pro entitlement to AsyncStorage (via gateway settings blob). */
export async function persistLeashProEntitlement(active: boolean): Promise<GatewaySettings> {
  const current = await storage.loadGatewaySettings();
  const next = active ? withLeashProEnabled(current) : withLeashProDisabled(current);
  await storage.saveGatewaySettings(next);
  return next;
}
