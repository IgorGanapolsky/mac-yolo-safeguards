import Link from "next/link";
import type { Metadata } from "next";
import { BrandMark } from "../BrandMark";

export const metadata: Metadata = {
  title: "Terms — ThumbGate hosted Hermes",
  description:
    "Hosted Hermes is a fenced VPS runner. Flat $10/mo. Approvals stay in thumbgate.app.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <main className="landing-shell">
      <nav className="topbar landing-nav" aria-label="Primary navigation">
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <div className="nav-actions">
          <Link href="/#pricing" className="nav-link">Pricing</Link>
          <Link href="/privacy" className="nav-link">Privacy</Link>
        </div>
      </nav>
      <section id="main-content" className="section-block" tabIndex={-1}>
        <div className="section-heading">
          <p className="eyebrow">Terms</p>
          <h1>Hosted Hermes is the product.</h1>
          <p>Hosted Hermes is a fenced VPS runner with in-app approvals. Live list price is /api/billing/plan.</p>
        </div>
        <div className="steps-grid">
          <article>
            <h2>Plan</h2>
            <p>Flat $10/mo hosted Hermes with a 14-day trial. Not per-token. Cancel in the billing portal after sign-in.</p>
          </article>
          <article>
            <h2>Approvals</h2>
            <p>You approve or deny tool calls in thumbgate.app. There is no phone leash on this product.</p>
          </article>
          <article>
            <h2>Use</h2>
            <p>Do not use hosted Hermes to break the law or other people&apos;s systems. We may suspend an org that does.</p>
          </article>
        </div>
      </section>
      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <p><Link href="/privacy">Privacy</Link> · <Link href="/#pricing">Start hosted Hermes</Link></p>
      </footer>
    </main>
  );
}
