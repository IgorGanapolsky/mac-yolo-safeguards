/**
 * Stripe billing webhook plan updates.
 *
 * Guest checkout mints a hosted-pending org, then names it pending:<email>.
 * Login copies pro from that unpaid-membership shell onto the user's existing
 * workspace. A later customer.subscription.deleted for an *older* org must not
 * wipe the logged-in workspace while the pending paid sibling is still pro.
 */

export const INHERIT_OR_SUSPEND_SQL = `UPDATE organizations SET
  plan = CASE
    WHEN EXISTS (
      SELECT 1
      FROM organizations paid
      JOIN users u ON lower(paid.name) = 'pending:' || lower(u.email)
      JOIN memberships m ON m.user_id = u.id AND m.organization_id = organizations.id
      WHERE paid.plan IN ('pro', 'team')
        AND paid.id != organizations.id
    ) THEN 'pro'
    ELSE 'suspended'
  END,
  updated_at = ?
WHERE id = ?`;

/** After the pending:<email> shell itself is suspended, drop copied pro on claimed workspaces. */
export const CASCADE_PENDING_SHELL_SQL = `UPDATE organizations SET plan = 'suspended', updated_at = ?
WHERE id IN (
  SELECT m.organization_id
  FROM users u
  JOIN memberships m ON m.user_id = u.id
  JOIN organizations pending ON lower(pending.name) = 'pending:' || lower(u.email)
  WHERE pending.id = ?
    AND pending.plan = 'suspended'
)
AND id != ?`;
