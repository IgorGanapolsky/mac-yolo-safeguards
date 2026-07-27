import type { Metadata } from "next";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Hermes Web",
  description: "Your Hermes chats, machine status, Leash controls, and cloud continuity settings on the web.",
};

export default function Dashboard() {
  return <DashboardClient />;
}
