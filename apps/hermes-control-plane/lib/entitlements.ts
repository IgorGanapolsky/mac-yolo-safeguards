export interface OrganizationEntitlement {
  plan: string;
  trialEndsAt: number | null;
}

export function hasLocalControlAccess(plan: string | null | undefined): boolean {
  return Boolean(plan && plan !== "suspended");
}

export function hasCloudContinuationAccess(
  organization: OrganizationEntitlement,
  now = Date.now(),
): boolean {
  if (organization.plan === "pro" || organization.plan === "team") return true;
  return organization.plan === "trial"
    && organization.trialEndsAt !== null
    && organization.trialEndsAt >= now;
}
