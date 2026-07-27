import type { GatewaySettings } from '../types/gateway';
import { FREE_LEASH_WEEKLY_LIMIT, getFreeLeashWeeklyStateSync } from './freeLeashAllowance';
import { isDeveloperLeashBackdoorActive } from './developerLeashUnlock';
import { isStorePaidDownloadEntitled } from './playPaidEntitlement';

export { FREE_LEASH_WEEKLY_LIMIT as LEASH_FREE_APPROVALS_PER_WEEK };

let proEntitlementSnapshot = false;

/** Keeps approval resolver in sync when GatewayContext callers omit leashSettings. */
export function syncLeashEntitlementSnapshot(settings: GatewaySettings): void {
  proEntitlementSnapshot = hasThumbgateLeashPro(settings);
}

export function isProEntitledFromSnapshot(): boolean {
  return proEntitlementSnapshot;
}

export function hasThumbgateLeashPro(settings: GatewaySettings): boolean {
  if (isStorePaidDownloadEntitled()) {
    return true;
  }
  if (settings.thumbgateProActive === true) {
    return true;
  }
  return isDeveloperLeashBackdoorActive(settings);
}

/** Pro IAP, dev backdoor, or free weekly allowance with remaining routed approvals. */
export function isThumbgateLeashUnlocked(settings: GatewaySettings): boolean {
  if (hasThumbgateLeashPro(settings)) {
    return true;
  }
  return getFreeLeashWeeklyStateSync().remaining > 0;
}

export function formatLeashFreeAllowanceLabel(settings: GatewaySettings): string {
  if (hasThumbgateLeashPro(settings)) {
    return 'Leash Pro — unlimited approvals';
  }
  const { remaining, limit } = getFreeLeashWeeklyStateSync();
  return `${remaining} of ${limit} free approvals left this week`;
}

/** @deprecated Use formatLeashFreeAllowanceLabel */
export const formatFreeLeashAllowanceLabel = formatLeashFreeAllowanceLabel;

export function isLeashFreeAllowanceExhausted(settings: GatewaySettings): boolean {
  return !hasThumbgateLeashPro(settings) && getFreeLeashWeeklyStateSync().remaining <= 0;
}
