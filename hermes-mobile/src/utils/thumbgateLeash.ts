import type { GatewaySettings } from '../types/gateway';
import { isDeveloperLeashBackdoorActive } from './developerLeashUnlock';

/** ThumbGate Leash (mobile approval relay) requires Pro or the explicit dev backdoor. */
export function isThumbgateLeashUnlocked(settings: GatewaySettings): boolean {
  if (settings.thumbgateProActive === true) {
    return true;
  }
  if (isDeveloperLeashBackdoorActive(settings)) {
    return true;
  }
  return false;
}
