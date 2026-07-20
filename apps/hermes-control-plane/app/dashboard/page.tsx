import type { Metadata } from "next";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = { title: "Dashboard · Leash by ThumbGate" };

export default function Dashboard() {
  return <DashboardClient />;
}
