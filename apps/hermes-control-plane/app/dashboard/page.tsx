import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { listOrganizationApprovals } from "@/lib/action-approvals";
import { db } from "@/lib/runtime";
import { ApprovalInboxBadge } from "./ApprovalInboxBadge";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Hermes Web",
  description: "Your Hermes chats, machine status, Leash controls, and cloud continuity settings on the web.",
};

export default async function Dashboard() {
  const session = await requireSession();
  const { pendingCount } = await listOrganizationApprovals(db(), session.organizationId);
  return (
    <>
      <DashboardClient />
      <ApprovalInboxBadge pendingCount={pendingCount} />
    </>
  );
}
