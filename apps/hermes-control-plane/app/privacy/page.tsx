import Link from "next/link";
import type { Metadata } from "next";
import { BrandMark } from "../BrandMark";

export const metadata: Metadata = {
  title: "Privacy — ThumbGate hosted Hermes",
  description:
    "What hosted Hermes collects: sign-in, billing, and workspace receipts. Approvals stay in thumbgate.app.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <main className="landing-shell">
      <nav className="topbar landing-nav" aria-label="Primary navigation">
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <div className="nav-actions">
          <Link href="/#pricing" className="nav-link">Pricing</Link>
          <Link href="/terms" className="nav-link">Terms</Link>
        </div>
      </nav>
      <section id="main-content" className="section-block" tabIndex={-1}>
        <div className="section-heading">
          <p className="eyebrow">Privacy</p>
          <h1>Closed-system. Your workspace stays yours.</h1>
          <p>Hosted Hermes runs on thumbgate.app. Approvals happen in the browser, not on a phone leash.</p>
        </div>
        <div className="steps-grid">
          <article>
            <h2>What we collect</h2>
            <p>WorkOS sign-in (email), Stripe billing events for hosted Hermes, and hosted run receipts inside your signed-in org.</p>
          </article>
          <article>
            <h2>What we do not do</h2>
            <p>We do not sell workspace contents. We do not use a phone leash as the approval surface. We do not invent customer counts on this site.</p>
          </article>
          <article>
            <h2>Where to manage it</h2>
            <p>Sign in and use the billing portal for plan and payment data. Sign out on a shared device from the landing session chrome.</p>
          </article>
        </div>
      </section>
      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <p><Link href="/terms">Terms</Link> · <Link href="/#pricing">Start hosted Hermes</Link></p>
      </footer>
    </main>
  );
}
