import Link from "next/link";
import { BillingPlan } from "./BillingPlan";
import { FailoverPathDemo } from "./FailoverPathDemo";
import { FunnelSignals } from "./FunnelSignals";
import {
  LandingFaq,
  LandingFinalCta,
  LandingSellGrid,
  LandingSellJourney,
  LandingStickyCta,
} from "./LandingSellJourney";
import { RemoteControlDiagram } from "./RemoteControlDiagram";
import {
  LandingAuthHero,
  LandingAuthNav,
  LandingAuthPanel,
  LandingPricingCtaFree,
  LandingPricingCtaPaid,
} from "./LandingAuthChrome";
import styles from "./landing.module.css";

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

/**
 * Public marketing shell is static: no cookie jar reads and no D1 on first paint.
 * Session chrome hydrates via /api/me after paint (LandingAuthChrome).
 * Interactive sell surfaces are client islands (pair journey, FAQ, sticky CTA).
 */
const FAQ_ITEMS = [
  {
    question: "What is ThumbGate?",
    answer:
      "ThumbGate is the Hermes web dashboard and Continuity product: remote control of Hermes from any browser, free while your Mac is online, with optional paid VPS continuity when it goes offline.",
  },
  {
    question: "What is Hermes Mobile?",
    answer:
      "Hermes Mobile is the iOS and Android app that chats with your Hermes agent on your Mac, handles Leash approvals, and switches between paired computers—same remote-control model as the ThumbGate web dashboard.",
  },
  {
    question: "Where can I download Hermes Mobile?",
    answer:
      "Get Hermes Mobile on Google Play and the App Store. Use https://thumbgate.app/go/android and https://thumbgate.app/go/ios for the current store listings.",
  },
  {
    question: "How do I control Hermes from my phone?",
    answer:
      "Install Hermes Mobile, pair once to the Mac that runs Hermes (home Wi‑Fi, USB when cabled, or Tailscale off home network), then chat and approve work from your pocket. No inbound ports are required.",
  },
  {
    question: "Does ThumbGate open inbound ports on my Mac?",
    answer:
      "No. The connector dials out over HTTPS with private-key pairing. Your local gateway credential stays on the Mac; ThumbGate uses a separate device identity.",
  },
  {
    question: "What happens when my Mac is offline?",
    answer:
      "Free Web Control pauses or asks. Eligible trial or paid Cloud Continuity tasks can continue on a fenced VPS runner so work stays recoverable when the lid closes.",
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
        description:
          "Web dashboard for Hermes remote control, with optional VPS continuity when your machine is offline.",
        offers: [
          { "@type": "Offer", name: "Web Control", price: "0", priceCurrency: "USD" },
        ],
      },
      {
        "@type": "MobileApplication",
        name: "Hermes Mobile",
        alternateName: ["Hermes Mobile: AI Agent", "Hermes AI Agent Leash"],
        applicationCategory: "DeveloperApplication",
        operatingSystem: "iOS, Android",
        description:
          "Phone app to chat with Hermes on your Mac, approve Leash actions, and switch computers without inbound ports.",
        url: "https://thumbgate.app/#mobile",
        installUrl: [
          "https://thumbgate.app/go/android",
          "https://thumbgate.app/go/ios",
        ],
        offers: [
          { "@type": "Offer", price: "0", priceCurrency: "USD" },
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
        <Link href="/" className="brand"><Mark /><span>ThumbGate <small>Hermes Web</small></span></Link>
        <LandingAuthNav />
      </nav>

      <section id="main-content" className="hero" tabIndex={-1}>
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Free online · Continuity when offline</p>
          <h1>
            Hermes dashboard from any browser.
            <br />
            <span>Keep going when the Mac sleeps.</span>
          </h1>
          <p className="hero-lede">
            Chat and Leash from the web while your Mac is online — free. When the lid closes mid-task, free control
            pauses. Continuity is the paid fenced VPS that finishes eligible work: 14-day trial, 5 cloud runs, then
            list price.
          </p>
          <LandingAuthHero />
          <p className="signin-note">
            Free path: sign in and pair. Paid path: enable Continuity after trial when offline work matters.
          </p>
          <div className="trust-row">
            <span>Free while Mac is online</span>
            <span>Continuity = paid VPS failover</span>
            <span>14-day trial · 5 cloud runs</span>
          </div>
          <div className="hero-store-links" aria-label="Hermes Mobile apps">
            <a
              href="/go/android"
              className="store-link store-link-play"
              data-funnel-event="play_store_click"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="store-link-badge" aria-hidden="true">▶</span>
              <span><strong>Google Play</strong><small>Hermes Mobile</small></span>
            </a>
            <a
              href="/go/ios"
              className="store-link store-link-ios"
              data-funnel-event="app_store_click"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="store-link-badge" aria-hidden="true">A</span>
              <span><strong>App Store</strong><small>Hermes AI Agent Leash</small></span>
            </a>
          </div>
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <RemoteControlDiagram />
          <LandingAuthPanel />
        </nav>
      </section>

      <section id="pair" className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">Pair once · click each step</p>
          <h2>Connect your Mac. Open the dashboard.</h2>
          <p>Interactive setup — copy the installer, sign in, choose offline policy. Real product path, not a brochure.</p>
        </div>
        <LandingSellJourney />
      </section>

      <section id="how-it-works" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Interactive · not a screenshot</p>
          <h2>Remote control. Keep going offline.</h2>
          <p>
            Free web dashboard while your Mac is online. Paid Continuity can fail eligible threads over to a fenced VPS runner
            when the machine disappears — one thread, one executor. Your Hermes work stays recoverable.
          </p>
        </div>
        <LandingSellGrid />
        <FailoverPathDemo />
        <div className="steps-grid steps-grid-after-demo">
          <article><span>01</span><h3>Web dashboard</h3><p>Chats, machines, and Leash controls from any browser.</p></article>
          <article><span>02</span><h3>Run on your Mac</h3><p>While online, work stays on the paired machine under a 90s lease.</p></article>
          <article><span>03</span><h3>Continuity (VPS)</h3><p>When the lid closes: pause, ask, or auto-continue on paid Continuity.</p></article>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="pricing-copy">
          <p className="eyebrow">Where the money is · Continuity</p>
          <h2>Pay when the Mac can&apos;t finish the work.</h2>
          <p>
            Free Web Control is the daily driver. Continuity is the upgrade you buy when offline / sleep / crash would
            kill a thread — trial first (5 cloud runs in 14 days), then the list price shown on the card.
          </p>
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
            <div><span>Cloud Continuity</span><BillingPlan /></div>
            <ul>
              <li>Everything in Web Control</li>
              <li>100 cloud continuations every 30 days</li>
              <li>VPS failover when Mac is offline</li>
              <li>14-day trial with 5 cloud runs</li>
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
            Hermes Mobile pairs to your Mac the same way as the web dashboard — chat, Leash approvals, and continuity
            settings when you&apos;re away from a browser.
          </p>
        </div>
        <div className="hero-store-links hero-store-links-lg">
          <a
            href="/go/android"
            className="store-link store-link-play"
            data-funnel-event="play_store_click"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="store-link-badge" aria-hidden="true">▶</span>
            <span><strong>Get it on Google Play</strong><small>Hermes Mobile for Android</small></span>
          </a>
          <a
            href="/go/ios"
            className="store-link store-link-ios"
            data-funnel-event="app_store_click"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="store-link-badge" aria-hidden="true">A</span>
            <span><strong>Download on the App Store</strong><small>Hermes AI Agent Leash</small></span>
          </a>
        </div>
      </section>

      <section id="faq" className="section-block" aria-labelledby="faq-heading">
        <div className="section-heading">
          <p className="eyebrow">Answers · click to expand</p>
          <h2 id="faq-heading">What people ask before they pair.</h2>
        </div>
        <LandingFaq items={FAQ_ITEMS} />
      </section>

      <LandingFinalCta />

      <footer>
        <Link href="/" className="brand"><Mark /><span>ThumbGate <small>Hermes Web</small></span></Link>
        <p>Your Hermes work, on the web — and still running when the lid closes.</p>
      </footer>

      <LandingStickyCta />
    </main>
  );
}
