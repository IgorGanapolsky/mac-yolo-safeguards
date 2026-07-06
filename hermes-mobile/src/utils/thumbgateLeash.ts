import type { GatewaySettings } from '../types/gateway';
import { isLeashProEnabled } from './leashPro';

/** @deprecated Use isLeashProEnabled — Pro now gates rule management, not chat approvals. */
export function isThumbgateLeashUnlocked(settings: GatewaySettings): boolean {
  return isLeashProEnabled(settings);
}
