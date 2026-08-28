import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SentryInit } from "./SentryInit";
import { WebMcpTools } from "./WebMcpTools";

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
    default: "ThumbGate — Hermes that stays on",
    template: "%s | ThumbGate",
  },
  description:
    "Hosted on a fenced VPS. Not a laptop process. Approve money, customer, or production actions in this browser. Flat $10/month. 14 days free. Cancel anytime.",
  alternates: { canonical: "/" },
  applicationName: "ThumbGate",
  category: "developer tools",
  keywords: [
    "ThumbGate",
    "hosted Hermes",
    "fenced VPS",
    "always-on VPS",
    "in-browser approvals",
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
    siteName: "ThumbGate",
    title: "ThumbGate — Hermes that stays on",
    description:
      "Hosted on a fenced VPS. Not a laptop process. Approvals stay in thumbgate.app. The agent keeps running on a fenced VPS. $10/mo, 14 days free, cancel anytime.",
    images: [{
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: "ThumbGate — hosted Hermes on a fenced VPS",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ThumbGate — Hermes that stays on",
    description: "Hosted Hermes on a fenced VPS. Approvals in thumbgate.app. $10/mo, 14 days free, cancel anytime.",
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
        {/* Chrome WebMCP origin trial (registered 2026-08-28, expires 2026-11-16,
            origin https://www.thumbgate.app:443, third-party + subdomains).
            Activates document.modelContext for the landing WebMCP tools
            (app/WebMcpTools.tsx) on Chrome without command-line flags. */}
        <meta
          httpEquiv="origin-trial"
          content="A8bP4dX73rtHHvjx5rmoKUE7geKzbc/ssHJNYbqDCgXDngxc/0zEZysIJGKh4f5Gx9H3Y1uF93TgR2ahxuFY6wkAAAB4eyJvcmlnaW4iOiJodHRwczovL3d3dy50aHVtYmdhdGUuYXBwOjQ0MyIsImZlYXR1cmUiOiJXZWJNQ1AiLCJleHBpcnkiOjE3OTQ4NzM2MDAsImlzU3ViZG9tYWluIjp0cnVlLCJpc1RoaXJkUGFydHkiOnRydWV9"
        />
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
        <SentryInit />
        <WebMcpTools />
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
