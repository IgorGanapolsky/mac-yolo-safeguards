import type { Metadata } from "next";
import LessonsClient from "./LessonsClient";

export const metadata: Metadata = {
  title: "ThumbGate lessons",
  description: "Review the Hermes responses you marked helpful or needing improvement.",
};

export default function LessonsPage() {
  return <LessonsClient />;
}
