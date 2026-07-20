import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://thumbgate.app"),
  title: {
    default: "Leash — Keep Hermes agents working safely",
    template: "%s | Leash by ThumbGate",
  },
  description: "Control Hermes threads from the web and continue approved work on a fenced cloud runner when your machine goes offline.",
  alternates: { canonical: "/" },
  applicationName: "Leash by ThumbGate",
  category: "developer tools",
  keywords: [
    "Hermes agent",
    "AI agent control plane",
    "agent failover",
    "agent observability",
    "runaway agent safeguards",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, maxImagePreview: "large" },
  },
  openGraph: {
    type: "website",
    url: "https://thumbgate.app/",
    siteName: "Leash by ThumbGate",
    title: "Leash — Keep Hermes agents working safely",
    description: "Free web control for your Hermes machine, with paid fenced cloud continuation when it goes offline.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Leash — Keep Hermes agents working safely",
    description: "Free web control for Hermes. Paid cloud continuity when your machine goes offline.",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
