import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * Phone notch / home-indicator safe areas.
 * Note: vinext may still emit a bare viewport meta without viewport-fit; we also
 * force-correct it in <head> below so the FIRST effective meta includes cover.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0F19",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://thumbgate.app"),
  title: {
    default: "ThumbGate Continuity — VPS failover for Hermes agents",
    template: "%s | ThumbGate Continuity",
  },
  description:
    "Continuity keeps autonomous agent work running 24/7 on a fenced VPS sandbox under LLM-as-a-Judge pre-action safety gates. Flat $10/month with full agent observability.",
  alternates: { canonical: "/" },
  applicationName: "ThumbGate Continuity",
  category: "developer tools",
  keywords: [
    "ThumbGate Continuity",
    "Hermes agent",
    "VPS failover",
    "agent failover",
    "cloud continuity",
    "Hermes offline",
    "agent observability",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, maxImagePreview: "large" },
  },
  openGraph: {
    type: "website",
    url: "https://thumbgate.app/",
    siteName: "ThumbGate Continuity",
    title: "ThumbGate Continuity — VPS failover for Hermes agents",
    description:
      "Autonomous agent work on a fenced VPS sandbox under LLM-as-a-Judge pre-action safety gates. Flat $10/month.",
    images: [{
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: "ThumbGate Continuity — VPS failover for Hermes",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ThumbGate Continuity — VPS failover for Hermes agents",
    description: "Fenced VPS Continuity with 90s renewable leases and LLM-as-a-Judge pre-action safety.",
    images: ["/og.png"],
  },
  icons: {
    // Match thumbgate.ai: TG gate monogram + PNG app icon / apple touch
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/thumbgate-icon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
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
        {/* vinext may inject a viewport meta WITHOUT viewport-fit first; browsers honor the first.
            Normalize to a single cover meta so env(safe-area-inset-*) works on notched phones. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var nodes=document.querySelectorAll('meta[name=viewport]');if(!nodes.length){var m=document.createElement('meta');m.setAttribute('name','viewport');m.setAttribute('content','width=device-width, initial-scale=1, viewport-fit=cover');document.head.appendChild(m);return;}var content='width=device-width, initial-scale=1, viewport-fit=cover';nodes[0].setAttribute('content',content);for(var i=1;i<nodes.length;i++){nodes[i].parentNode&&nodes[i].parentNode.removeChild(nodes[i]);}})();",
          }}
        />
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
