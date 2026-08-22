import { currentSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ClientErrorBeacon } from "../ClientErrorBeacon";
import { DashboardTurnChrome } from "./DashboardTurnChrome";
import styles from "./turn-statusline.module.css";

export default async function PrivateDashboardLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/api/auth/login?return_to=%2Fdashboard");
  return (
    <div className={styles.frame}>
      <ClientErrorBeacon />
      <div className={styles.body}>{children}</div>
      <DashboardTurnChrome />
    </div>
  );
}
