export interface OrganizationEntitlement {
  plan: string;
  trialEndsAt: number | null;
  /** When set, pro access from store receipts expires at this epoch ms. */
  storeEntitlementExpiresAt?: number | null;
}

export function hasLocalControlAccess(plan: string | null | undefined): boolean {
  return Boolean(plan && plan !== "suspended");
}

export function hasCloudContinuationAccess(
  organization: OrganizationEntitlement,
  now = Date.now(),
): boolean {
  if (organization.plan === "team") return true;
  if (organization.plan === "pro") {
    const expires = organization.storeEntitlementExpiresAt;
    if (expires == null) return true;
    return expires >= now;
  }
  return organization.plan === "trial"
    && organization.trialEndsAt !== null
    && organization.trialEndsAt >= now;
}
