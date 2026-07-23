/**
 * WorkOS identity resolution for the auth callback.
 *
 * Observed production failure (2026-07-23):
 * - WorkOS can mint a *new* workos_user_id for the same email (e.g. fresh Google SSO).
 * - Looking up only by workos_user_id forks a second user + empty org → "0 paired machines".
 * - Even with a correct user, filtering memberships by payload.organization_id when the
 *   stored org has workos_organization_id = NULL also forks an empty workspace.
 *
 * Rules:
 * 1. Resolve user by workos_user_id, else by normalized email (self-heal workos id).
 * 2. Prefer an existing membership that already has paired devices / paid plan.
 * 3. Never create a second org when the user already has a membership.
 * 4. Backfill workos_organization_id onto the chosen org when it is null.
 */

export type MembershipCandidate = {
  organizationId: string;
  plan: string;
  workosOrganizationId: string | null;
  deviceCount: number;
  membershipCreatedAt: number;
};

function planRank(plan: string): number {
  if (plan === "pro" || plan === "team") return 3;
  if (plan === "trial") return 2;
  return 1;
}

/**
 * Pure ranking: prefer devices, then paid plan, then older membership.
 * Exact WorkOS org match is a tie-breaker when device counts match.
 */
export function pickBestMembership(
  candidates: MembershipCandidate[],
  preferredWorkosOrgId: string | null = null,
): MembershipCandidate | null {
  if (!candidates.length) return null;

  const preferred = preferredWorkosOrgId?.trim() || null;
  if (preferred) {
    const exactWithDevices = candidates.find(
      (c) => c.workosOrganizationId === preferred && c.deviceCount > 0,
    );
    if (exactWithDevices) return exactWithDevices;
  }

  const ranked = [...candidates].sort((a, b) => {
    if (b.deviceCount !== a.deviceCount) return b.deviceCount - a.deviceCount;
    const planDiff = planRank(b.plan) - planRank(a.plan);
    if (planDiff !== 0) return planDiff;
    if (preferred) {
      const aMatch = a.workosOrganizationId === preferred ? 1 : 0;
      const bMatch = b.workosOrganizationId === preferred ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
    }
    return a.membershipCreatedAt - b.membershipCreatedAt;
  });

  return ranked[0] ?? null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function shouldBackfillWorkosOrganizationId(
  chosen: MembershipCandidate,
  preferredWorkosOrgId: string | null,
): boolean {
  const preferred = preferredWorkosOrgId?.trim() || null;
  if (!preferred) return false;
  if (chosen.workosOrganizationId === preferred) return false;
  // Only backfill when the org has never been linked — avoid clobbering a real id.
  return chosen.workosOrganizationId == null || chosen.workosOrganizationId === "";
}
