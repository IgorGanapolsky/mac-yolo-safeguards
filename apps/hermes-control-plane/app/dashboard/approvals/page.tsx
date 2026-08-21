import type { Metadata } from "next";
import Link from "next/link";
import { listOrganizationApprovals } from "@/lib/action-approvals";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/runtime";
import styles from "../approval-inbox.module.css";
import { ApprovalInboxClient } from "./ApprovalInboxClient";

export const metadata: Metadata = {
  title: "Action approvals | ThumbGate",
  description: "Approve or deny sensitive Hosted Hermes actions.",
};

export default async function ApprovalsPage() {
  const session = await requireSession();
  const initial = await listOrganizationApprovals(db(), session.organizationId);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Hosted Hermes · approval boundary</p>
          <h1>Action approvals</h1>
          <p>Only a redacted summary and argument digest are stored. Approvals are single-use and expire automatically.</p>
        </div>
        <Link className={styles.backLink} href="/dashboard">Back to Hermes</Link>
      </header>
      <ApprovalInboxClient initial={initial} />
    </main>
  );
}
