import { currentSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function PrivateDashboardLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/api/auth/login?return_to=%2Fdashboard");
  return children;
}
