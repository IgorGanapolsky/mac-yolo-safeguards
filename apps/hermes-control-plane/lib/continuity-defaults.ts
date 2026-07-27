import { hasCloudContinuationAccess, type OrganizationEntitlement } from "./entitlements";

/** Paid Continuity should default to automatic VPS failover; free/local stays ask-first. */
export function defaultFailoverModeForOrganization(
  organization: OrganizationEntitlement,
  now = Date.now(),
): "auto" | "manual" {
  return hasCloudContinuationAccess(organization, now) ? "auto" : "manual";
}
