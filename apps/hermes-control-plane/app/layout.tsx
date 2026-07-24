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
    default: "ThumbGate — Hermes dashboard & continuity",
    template: "%s | ThumbGate for Hermes",
  },
  description: "Web remote control for Hermes agents. Free dashboard while your Mac is online; paid Continuity keeps work running on a VPS when it is offline.",
  alternates: { canonical: "/" },
  applicationName: "ThumbGate for Hermes",
  category: "developer tools",
  keywords: [
    "Hermes agent",
    "Hermes web dashboard",
    "AI agent remote control",
    "agent failover",
    "cloud continuity",
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
