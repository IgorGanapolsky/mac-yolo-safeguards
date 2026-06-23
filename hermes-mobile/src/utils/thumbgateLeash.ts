import type { GatewaySettings } from '../types/gateway';

/** ThumbGate Leash (mobile approval relay) requires ThumbGate Pro. */
export function isThumbgateLeashUnlocked(settings: GatewaySettings): boolean {
  return settings.thumbgateProActive === true;
}
