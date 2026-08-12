import Link from "next/link";
import { BillingPlan } from "./BillingPlan";
import { FailoverPathDemo } from "./FailoverPathDemo";
import { FunnelSignals } from "./FunnelSignals";
import { RemoteControlDiagram } from "./RemoteControlDiagram";
import {
  LandingAuthHero,
  LandingAuthNav,
  LandingAuthPanel,
  LandingPricingCtaFree,
  LandingPricingCtaPaid,
} from "./LandingAuthChrome";
import { BrandMark } from "./BrandMark";
import { StoreBadgeRow } from "./StoreBadges";
import styles from "./landing.module.css";

/**
 * Public marketing shell is static: no cookie jar reads and no D1 on first paint.
 * Session chrome hydrates via /api/me after paint (LandingAuthChrome).
 *
 * Product truth (2026-08): ThumbGate.app = Continuity / VPS failover synced with
 * Hermes agents on real machines. Hermes (desktop + Mobile) owns chatting with
 * those machines. Free pair/status is scaffolding, not a second chat product.
 */
const FAQ_ITEMS = [
  {
    question: "What is ThumbGate?",
    answer:
      "ThumbGate Continuity is paid VPS failover for Hermes: when your Mac goes offline, eligible work continues on a fenced cloud runner under the policy you set—synced with the same Hermes agents that run on your machines.",
  },
  {
    question: "What is Hermes Mobile?",
    answer:
      "Hermes Mobile is the iOS and Android app that chats with your Hermes agent on your real machines, handles Leash approvals, and switches between paired computers. Chat lives in Hermes; ThumbGate Continuity keeps eligible work running when those machines are offline.",
  },
  {
    question: "Does ThumbGate open inbound ports on my Mac?",
    answer:
      "No. The connector dials out over HTTPS with private-key pairing. Your local gateway credential stays on the Mac; ThumbGate uses a separate device identity.",
  },
  {
    question: "What happens when my Mac is offline?",
    answer:
      "Without Continuity, free pair/status scaffolding pauses or asks. Eligible trial or paid Continuity tasks continue on a fenced VPS runner so work stays recoverable when the lid closes.",
  },
  {
    question: "How much does ThumbGate cost?",
    answer:
      "Pairing and status scaffolding are free. Continuity is a recurring paid subscription (VPS failover when offline); current pricing is shown live on this page and at https://thumbgate.app/api/billing/plan.",
  },
] as const;

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "ThumbGate Continuity",
        url: "https://thumbgate.app/",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web, macOS, iOS, Android",
        description:
          "VPS failover Continuity for Hermes agents on real machines. Chat stays in Hermes; Continuity keeps eligible work running when the laptop is offline.",
        offers: [
          { "@type": "Offer", name: "Pair & status (free)", price: "0", priceCurrency: "USD" },
          { "@type": "Offer", name: "Pro Continuity", priceCurrency: "USD" },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <main className="landing-shell">
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <FunnelSignals />
      <nav className="topbar landing-nav" aria-label="Primary navigation">
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Continuity</small></span></Link>
        <LandingAuthNav />
      </nav>

      <section id="main-content" className="hero" tabIndex={-1}>
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Continuity · VPS for Hermes</p>
          <h1>Keep Hermes work running<br /><span>when the Mac closes.</span></h1>
          <p className="hero-lede">
            Hermes already chats with your real machines—and Leash approvals stay on the paired Mac while it is online. ThumbGate Continuity syncs with those same agents and hands eligible work to a fenced VPS runner when the laptop is offline, under the offline policy you set (pause, ask, or auto-continue).
          </p>
          <LandingAuthHero />
          <p className="signin-note">Continuity by ThumbGate. Continue with Google today — more providers activate once configured.</p>
          <div className="trust-row"><span>No inbound ports</span><span>Same Hermes agents</span><span>Fenced VPS only when enabled</span></div>
          <StoreBadgeRow />
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <RemoteControlDiagram />
          <LandingAuthPanel />
        </nav>
      </section>

      <section id="pair" className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">Pair once · free scaffolding</p>
          <h2>Connect your Mac. Enable Continuity.</h2>
        </div>
        <ol className="setup-steps">
          <li><span>01</span><div><h3>Run one installer</h3><p>Connector dials out over HTTPS. No inbound ports.</p></div></li>
          <li><span>02</span><div><h3>Approve the Mac</h3><p>Sign in and confirm the short code. Hermes still owns the chat.</p></div></li>
          <li><span>03</span><div><h3>Pick offline behavior</h3><p>Pause, ask, or auto-continue on Continuity (VPS).</p></div></li>
        </ol>
      </section>

      <section id="how-it-works" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Hermes on machines · Continuity when offline</p>
          <h2>Chat stays in Hermes. Continuity keeps work alive.</h2>
          <p>
            Pair free so status and failover policy are in place. Paid Continuity fails eligible threads over to a fenced VPS runner when the machine disappears—one thread, one executor, synced with Hermes on your real hardware.
          </p>
        </div>
        <FailoverPathDemo />
        <div className="steps-grid steps-grid-after-demo">
          <article><span>01</span><h3>Hermes on your machines</h3><p>Desktop and Hermes Mobile chat and approve tools on the paired Mac.</p></article>
          <article><span>02</span><h3>Run on your Mac</h3><p>While online, work stays on the paired machine under a 90s lease.</p></article>
          <article><span>03</span><h3>Continuity (VPS)</h3><p>When the lid closes: pause, ask, or auto-continue on paid Continuity.</p></article>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="pricing-copy">
          <p className="eyebrow">Free pair. Paid Continuity.</p>
          <h2>Pay only when the Mac can&apos;t run the work.</h2>
        </div>
        <div className="price-grid">
          <article className="price-card">
            <div><span>Pair &amp; status</span><strong>$0<small>/month</small></strong></div>
            <ul>
              <li>Signed machine pairing</li>
              <li>Offline policy (pause / ask)</li>
              <li>Status scaffolding while online</li>
              <li>Hermes Mobile still owns chat</li>
            </ul>
            <LandingPricingCtaFree />
          </article>
          <article className="price-card featured">
            <div><span>Pro Continuity</span><BillingPlan /></div>
            <ul>
              <li>Fenced VPS when the Mac is offline</li>
              <li>100 cloud continuations / 30 days</li>
              <li>DeepSeek &amp; Auto model routing</li>
              <li>14-day trial with 5 cloud runs</li>
            </ul>
            <LandingPricingCtaPaid />
          </article>
          <article className="price-card">
            <div><span>Team &amp; Enterprise</span><strong>$49<small>/month</small></strong></div>
            <ul>
              <li>Everything in Pro Continuity</li>
              <li>500 cloud continuations / 30 days</li>
              <li>Auto model routing across providers</li>
              <li>Custom BYO API Key support</li>
              <li>Priority Fly.io cloud VPS runner</li>
            </ul>
            <LandingPricingCtaPaid />
          </article>
        </div>
      </section>


      <section id="mobile" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">On your phone · Hermes Mobile</p>
          <h2>Chat with your machines in Hermes. Continuity when they sleep.</h2>
          <p>
            Hermes Mobile pairs to your Mac for chat and Leash approvals. Continuity settings live here so eligible work can fail over to VPS when you&apos;re away from a browser and the machine is offline.
          </p>
        </div>
        <StoreBadgeRow className="hero-store-links-lg" size="lg" />
      </section>

      <section id="expertise" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Engineering expertise</p>
          <h2>Built from live production data, not static claims.</h2>
          <p>
            ThumbGate Continuity is maintained by the same engineering team that runs the Hermes stack. Our expertise page pairs original case studies with real D1 telemetry — pairing success, continuity runs, control-plane uptime, and scale metrics.
          </p>
        </div>
        <div className="steps-grid">
          <article>
            <span>01</span>
            <h3>Live telemetry</h3>
            <p>Success rates, p95 durations, and uptime computed from the production control plane.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Named case studies</h3>
            <p>Authored by the engineering team behind ThumbGate, with concrete metrics and outcomes.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Public methodology</h3>
            <p>Canary runs excluded, privacy boundary documented, raw JSON endpoint at /api/expertise/stats.</p>
          </article>
        </div>
        <div className="hero-actions" style={{ marginTop: "32px" }}>
          <Link href="/expertise" className="button button-primary">Read the expertise breakdown</Link>
        </div>
      </section>

      <section id="faq" className="section-block" aria-labelledby="faq-heading">
        <div className="section-heading">
          <p className="eyebrow">Answers</p>
          <h2 id="faq-heading">What people ask before they enable Continuity.</h2>
        </div>
        <div className="steps-grid">
          {FAQ_ITEMS.map((item) => (
            <article key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Continuity</small></span></Link>
        <p>Your Hermes work, still running when the lid closes—synced with agents on real machines.</p>
      </footer>
    </main>
  );
}
