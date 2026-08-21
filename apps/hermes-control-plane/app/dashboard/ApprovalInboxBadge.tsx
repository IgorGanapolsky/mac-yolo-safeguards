import Link from "next/link";
import styles from "./approval-inbox.module.css";

export function ApprovalInboxBadge({ pendingCount }: { pendingCount: number }) {
  return (
    <Link className={styles.dashboardBadge} href="/dashboard/approvals" aria-label={`Approvals, ${pendingCount} pending`}>
      <span aria-hidden="true">✓</span>
      <span>Approvals</span>
      <strong>{pendingCount}</strong>
    </Link>
  );
}
