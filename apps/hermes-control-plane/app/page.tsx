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
 */
const FAQ_ITEMS = [
  {
    question: "What is ThumbGate?",
    answer:
      "ThumbGate is the web control plane and safety leash for your Hermes AI agents. It gives you free remote control and phone approvals while your Mac is online, with optional Cloud Continuity when your Mac goes offline or closes the lid.",
  },
  {
    question: "What is Hermes Mobile?",
    answer:
      "Hermes Mobile is the iOS and Android app that pairs with your Hermes agent on your Mac via Home Wi-Fi, Tailscale, or USB. It delivers lock-screen approvals for high-risk tool calls and syncs chat sessions seamlessly across your devices.",
  },
  {
    question: "How does Cloud Continuity work when my Mac goes offline?",
    answer:
      "You stay in full control. When your Mac goes offline or closes its lid, ThumbGate applies your chosen policy: (1) Pause until online (Free — tasks wait until your Mac wakes up), (2) Ask me first (Notifies your phone so you can approve cloud failover with 1 tap), or (3) Auto cloud continuity (Fenced VPS runner immediately claims eligible tasks via an encrypted lease).",
  },
  {
    question: "Does ThumbGate open inbound ports or store my credentials?",
    answer:
      "No. Your local gateway credentials and API keys stay encrypted on your Mac. The connector uses outbound HTTPS WebSockets with private-key pairing. ThumbGate never opens inbound ports.",
  },
  {
    question: "How much does ThumbGate cost?",
    answer:
      "Web Control and local Mac remote pairing are 100% free while your Mac is online. Cloud Continuity (offline VPS failover) is an optional paid subscription. Live pricing is shown on this page and at https://thumbgate.app/api/billing/plan.",
  },
] as const;

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "ThumbGate for Hermes",
        url: "https://thumbgate.app/",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web, macOS, iOS, Android",
        description: "Web dashboard for Hermes remote control, with optional VPS continuity when your machine is offline.",
        offers: [
          { "@type": "Offer", name: "Web Control", price: "0", priceCurrency: "USD" },
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
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate Leash <small>Hermes Web</small></span></Link>
        <LandingAuthNav />
      </nav>

      <section id="main-content" className="hero" tabIndex={-1}>
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Hermes remote control</p>
          <h1>Hermes dashboard<br /><span>from any browser.</span></h1>
          <p className="hero-lede">
            Chat with your Hermes agents from any browser — and approve or deny each tool call before it runs on your Mac. When the Mac goes offline, optional Continuity hands eligible work to a fenced VPS runner under the policy you set.
          </p>
          <LandingAuthHero />
          <p className="signin-note">Hermes Web by ThumbGate. Continue with Google today — more providers activate once configured.</p>
          <div className="trust-row"><span>No inbound ports</span><span>Private-key pairing</span><span>Cloud only when enabled</span></div>
          <StoreBadgeRow />
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <RemoteControlDiagram />
          <LandingAuthPanel />
        </nav>
      </section>

      <section id="pair" className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">Pair once</p>
          <h2>Connect your Mac. Open the dashboard.</h2>
        </div>
        <ol className="setup-steps">
          <li><span>01</span><div><h3>Run one installer</h3><p>Connector dials out over HTTPS. No inbound ports.</p></div></li>
          <li><span>02</span><div><h3>Approve the Mac</h3><p>Sign in and confirm the short code.</p></div></li>
          <li><span>03</span><div><h3>Pick offline behavior</h3><p>Pause, ask, or continue on Continuity (VPS).</p></div></li>
        </ol>
      </section>

      <section id="how-it-works" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Dashboard + Continuity</p>
          <h2>Remote control. Keep going offline.</h2>
          <p>
            Free web dashboard while your Mac is online. Paid Continuity can fail eligible threads over to a fenced VPS runner when the machine disappears—one thread, one executor. Your Hermes work stays recoverable.
          </p>
        </div>
        <FailoverPathDemo />
        <div className="steps-grid steps-grid-after-demo">
          <article><span>01</span><h3>Web dashboard</h3><p>Chats, machines, and Leash controls from any browser.</p></article>
          <article><span>02</span><h3>Run on your Mac</h3><p>While online, work stays on the paired machine under a 90s lease.</p></article>
          <article><span>03</span><h3>Continuity (VPS)</h3><p>When the lid closes: pause, ask, or auto-continue on paid Continuity.</p></article>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="pricing-copy">
          <p className="eyebrow">Free control. Paid continuity.</p>
          <h2>Pay only when the Mac can&apos;t run the work.</h2>
        </div>
        <div className="price-grid">
          <article className="price-card">
            <div><span>Web Control</span><strong>$0<small>/month</small></strong></div>
            <ul>
              <li>Hermes web dashboard</li>
              <li>Signed machine pairing</li>
              <li>Synced chats while online</li>
              <li>Pause or ask when offline</li>
            </ul>
            <LandingPricingCtaFree />
          </article>
          <article className="price-card featured">
            <div><span>Pro Continuity</span><BillingPlan /></div>
            <ul>
              <li>Everything in Web Control</li>
              <li>100 cloud continuations / 30 days</li>
              <li>DeepSeek, Claude &amp; Auto routing</li>
              <li>14-day trial with 5 cloud runs</li>
            </ul>
            <LandingPricingCtaPaid />
          </article>
          <article className="price-card">
            <div><span>Team &amp; Enterprise</span><strong>$49<small>/month</small></strong></div>
            <ul>
              <li>Everything in Pro Continuity</li>
              <li>500 cloud continuations / 30 days</li>
              <li>Priority Claude Sonnet 5, Kimi K3 &amp; GLM 5.2 throughput</li>
              <li>Custom BYO API Key support</li>
              <li>Priority Fly.io cloud VPS runner</li>
            </ul>
            <LandingPricingCtaPaid />
          </article>
        </div>
      </section>


      <section id="mobile" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">On your phone</p>
          <h2>Same remote control. Push approvals in your pocket.</h2>
          <p>
            Hermes Mobile pairs to your Mac the same way as the web dashboard—chat, Leash approvals, and continuity settings when you&apos;re away from a browser.
          </p>
        </div>
        <StoreBadgeRow className="hero-store-links-lg" size="lg" />
      </section>

      <section id="faq" className="section-block" aria-labelledby="faq-heading">
        <div className="section-heading">
          <p className="eyebrow">Answers</p>
          <h2 id="faq-heading">What people ask before they pair.</h2>
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
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate Leash <small>Hermes Web</small></span></Link>
        <p>Your Hermes work, on the web—and still running when the lid closes.</p>
      </footer>
    </main>
  );
}
