import type { GatewaySettings } from '../types/gateway';

let proEntitlementSnapshot = false;

/** Keeps approval resolver in sync when GatewayContext callers omit leashSettings. */
export function syncLeashEntitlementSnapshot(settings: GatewaySettings): void {
  proEntitlementSnapshot = hasThumbgateLeashPro(settings);
}

export function isProEntitledFromSnapshot(): boolean {
  return proEntitlementSnapshot;
}

export function hasThumbgateLeashPro(_settings: GatewaySettings): boolean {
  return true;
}

/** Hermes Mobile is a paid download with Leash included. */
export function isThumbgateLeashUnlocked(_settings: GatewaySettings): boolean {
  return true;
}

export function formatLeashFreeAllowanceLabel(_settings: GatewaySettings): string {
  return 'Leash included — unlimited approvals';
}

/** @deprecated Use formatLeashFreeAllowanceLabel */
export const formatFreeLeashAllowanceLabel = formatLeashFreeAllowanceLabel;

export function isLeashFreeAllowanceExhausted(_settings: GatewaySettings): boolean {
  return false;
}
