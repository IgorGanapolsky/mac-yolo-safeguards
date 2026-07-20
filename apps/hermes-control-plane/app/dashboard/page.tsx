import type { Metadata } from "next";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = { title: "Dashboard · Hermes Control" };

export default function Dashboard() {
  return <DashboardClient />;
}
