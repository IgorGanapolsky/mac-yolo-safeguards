import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermes Control Plane",
  description: "Keep Hermes work moving when your primary machine goes offline.",
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
