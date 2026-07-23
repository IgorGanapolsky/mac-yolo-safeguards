import { adminConfigured, currentAdminSession } from "@/lib/admin-auth";
import { collectAdminMetrics } from "@/lib/admin-metrics";
import { AdminClient } from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const configured = adminConfigured();
  const authed = configured ? await currentAdminSession() : false;
  let metrics = null;
  if (authed) {
    try {
      metrics = await collectAdminMetrics();
    } catch {
      metrics = null;
    }
  }
  return (
    <main className="admin-shell">
      <AdminClient configured={configured} initiallyAuthed={authed} initialMetrics={metrics} />
    </main>
  );
}
