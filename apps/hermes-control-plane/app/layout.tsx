import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://thumbgate.app"),
  title: {
    default: "ThumbGate — Hermes dashboard & continuity",
    template: "%s | ThumbGate for Hermes",
  },
  description: "Web remote control for Hermes agents. Free dashboard while your Mac is online; paid Continuity keeps work running on a VPS when it is offline.",
  alternates: { canonical: "/" },
  applicationName: "ThumbGate for Hermes",
  category: "developer tools",
  keywords: [
    "Hermes agent",
    "Hermes Mobile",
    "Hermes Mobile AI Agent",
    "Hermes AI Agent",
    "AI agent phone app",
    "Hermes web dashboard",
    "AI agent remote control",
    "agent failover",
    "cloud continuity",
    "agent observability",
    "Leash approvals",
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
    title: "ThumbGate — Hermes dashboard & continuity",
    description: "Remote control Hermes from any browser. Continuity keeps eligible work on a VPS when your Mac is offline.",
    images: [{
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: "ThumbGate Hermes web dashboard and continuity",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ThumbGate — Hermes dashboard & continuity",
    description: "Web remote control for Hermes. Paid Continuity when your machine is offline.",
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
        {/* Display face for landing hero — Inter at 75px reads soft/generic for buyers. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
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
