import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://thumbgate.app"),
  title: {
    default: "ThumbGate — Self-Improving Firewall for your AI Agents",
    template: "%s | ThumbGate for Hermes",
  },
  description: "Self-improving firewall for your AI agents: approve Hermes tool calls, remember lessons from thumbs feedback, promote or demote gates, and re-rank what matters next—plus signed Mac pairing and optional fenced cloud continuation.",
  alternates: { canonical: "/" },
  applicationName: "ThumbGate for Hermes",
  category: "developer tools",
  keywords: [
    "Hermes agent",
    "self-improving firewall",
    "AI agent firewall",
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
    title: "ThumbGate — Self-Improving Firewall for your AI Agents",
    description: "Approve Hermes tool calls, remember lessons, promote or demote gates, and re-rank what matters next—with signed Mac pairing and optional fenced cloud continuation.",
    images: [{
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: "ThumbGate — Self-Improving Firewall for your AI Agents",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ThumbGate — Self-Improving Firewall for your AI Agents",
    description: "Self-improving firewall for your AI agents: lessons, promote/demote, re-rank—plus Hermes chats on the web.",
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
      <head>
        {/* Warm WorkOS + AuthKit before Sign in (July 2026 speed research). */}
        <link rel="preconnect" href="https://api.workos.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.workos.com" />
        <link rel="preconnect" href="https://progressive-mouse-13.authkit.app" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://progressive-mouse-13.authkit.app" />
      </head>
      <body>
        {children}
        <script
          // A deploy purges the previous build's hashed /assets/* chunks; a page
          // opened before the deploy then fails module preloads and goes inert.
          // Reload once to pick up the new build (guarded against reload loops).
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('vite:preloadError',function(e){var k='tg-preload-reload';var t=Number(sessionStorage.getItem(k)||0);if(Date.now()-t>10000){sessionStorage.setItem(k,String(Date.now()));e.preventDefault();location.reload();}});",
          }}
        />
      </body>
    </html>
  );
}
