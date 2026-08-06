import type { Metadata } from "next";
import ExpertiseClient from "./ExpertiseClient";

export const metadata: Metadata = {
  title: "Expertise — ThumbGate for Hermes",
  description:
    "Named-author engineering case studies with original, D1-backed data on running Hermes Agents in production: cloud continuity reliability, pairing latency, and control-plane uptime.",
  alternates: {
    canonical: "/expertise",
  },
};

export default function Expertise() {
  return <ExpertiseClient />;
}