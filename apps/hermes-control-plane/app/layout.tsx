import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://thumbgate.app"),
  title: {
    default: "ThumbGate — Your Hermes chats from any screen",
    template: "%s | ThumbGate for Hermes",
  },
  description: "Use the familiar Hermes workspace on the web, with signed Mac pairing and optional fenced cloud continuation when your machine goes offline.",
  alternates: { canonical: "/" },
  applicationName: "ThumbGate for Hermes",
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
    siteName: "ThumbGate for Hermes",
    title: "ThumbGate — Your Hermes chats from any screen",
    description: "The familiar Hermes workspace on the web, with signed Mac pairing and optional fenced cloud continuation.",
    images: [{
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: "ThumbGate brings your Hermes chats to any screen",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ThumbGate — Your Hermes chats from any screen",
    description: "The familiar Hermes workspace on the web. Paid cloud continuity when your machine goes offline.",
    images: ["/og.png"],
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
