import type { Metadata } from "next";
import ExpertiseClient from "./ExpertiseClient";

export const metadata: Metadata = {
  title: "Operator telemetry — ThumbGate",
  description:
    "Internal control-plane telemetry for hosted Hermes. No stranger case studies. No implied paying customers.",
  alternates: {
    canonical: "/expertise",
  },
};

export default function Expertise() {
  return <ExpertiseClient />;
}
