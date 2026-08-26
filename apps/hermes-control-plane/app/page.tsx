import Link from "next/link";
import { BillingPlan } from "./BillingPlan";
import { BrandMark } from "./BrandMark";
import { FunnelSignals } from "./FunnelSignals";
import {
  LandingAuthHero,
  LandingAuthNav,
  LandingAuthPanel,
  LandingPricingCtaFree,
  LandingPricingCtaPaid,
} from "./LandingAuthChrome";
import { FAQ_ITEMS } from "./landing-content";
import { RemoteControlDiagram } from "./RemoteControlDiagram";
import { StartSurfaces } from "./StartSurfaces";
import styles from "./landing.module.css";
import { CONTINUITY_PRICE_TIERS } from "@/lib/continuity-pricing";

const PRO_CTA = "Start hosted Hermes — $10/mo";

/**
 * Static decision page. Long-form examples, architecture, capacity, safety, and
 * FAQ content live at /how-it-works so a first-time visitor can understand the
 * offer before scrolling through implementation detail.
 */
export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Hosted Hermes",
        brand: { "@type": "Brand", name: "ThumbGate" },
        url: "https://thumbgate.app/",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        description:
          "Hosted Hermes on a fenced VPS. $10/mo. 14-day trial. Approvals in thumbgate.app. Not a Mac-pair product. Not ChatGPT Computer History / Windows Recall.",
        offers: [
          {
            "@type": "Offer",
            name: "Hosted Hermes",
            price: "10",
            priceCurrency: "USD",
            url: "https://thumbgate.app/",
            availability: "https://schema.org/InStock",
            description: "14-day trial. Cancel anytime.",
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: "10",
              priceCurrency: "USD",
              unitCode: "MON",
              billingDuration: "P1M",
            },
          },
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
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <LandingAuthNav />
      </nav>

      <section id="main-content" className="hero" tabIndex={-1}>
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Hosted Hermes · Fenced VPS</p>
          <h1>Hermes that stays on.</h1>
          <p className="hero-lede">
            One agent keeps working on a fenced VPS after your laptop sleeps. Money, customer, and production actions pause for your approval in this browser. $10/month after a 14-day trial.
          </p>
          <LandingAuthHero />
          <p className="signin-note">Sign in with email, Google, or Apple. No laptop required. Approvals happen in thumbgate.app.</p>
          <div id="example-tasks" className="hero-actions">
            <Link
              href="/how-it-works#example-tasks"
              className="button button-secondary"
              data-funnel-event="example_task_click"
              data-cta-id="watch-ci"
            >
              Give hosted Hermes a job →
            </Link>
          </div>
          <div className="trust-row" aria-label="Offer facts">
            <span>Always-on fenced VPS</span>
            <span>Human approval gates</span>
            <span>$10/mo · 14 days free</span>
          </div>
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <RemoteControlDiagram />
          <LandingAuthPanel />
        </nav>
      </section>

      <StartSurfaces />

      <div id="closed-system" className="proof-strip" aria-label="Hosted Hermes proof">
        <div><strong>24/7</strong><span>Fenced VPS stays awake</span></div>
        <div><strong>90s</strong><span>Renewable task leases</span></div>
        <div><strong>You</strong><span>Approve sensitive actions</span></div>
        <div>
          <strong><Link id="how-it-works" href="/how-it-works">Proof →</Link></strong>
          <span>Architecture, security, examples</span>
        </div>
      </div>

      <section id="pricing" className="pricing-section">
        <div className="pricing-copy">
          <p className="eyebrow">One offer · $10/mo · 14 days free · cancel anytime</p>
          <h2>Start on the VPS. Stay gated.</h2>
          <p>
            How do I get started? Sign in and start the hosted trial. There is no Mac, Windows, or Linux download. See the <Link href="/how-it-works#capacity">capacity and safety details</Link>.
          </p>
        </div>
        <div className="price-grid">
          <article className="price-card" data-testid="price-card-free">
            <div><span>Sign-in workspace</span><strong>$0<small>/start</small></strong></div>
            <p className="price-mode">Free · no hosted runs</p>
            <ul>
              <li>Account + hosted Hermes dashboard shell</li>
              <li>LLM-as-a-Judge policy surface</li>
              <li><strong>{CONTINUITY_PRICE_TIERS[0].cloudRunsDisplay}</strong> fenced VPS runs / 30 days</li>
            </ul>
            <LandingPricingCtaFree />
          </article>
          <article className="price-card featured" data-testid="price-card-pro">
            <div><span>Hosted Hermes</span><BillingPlan /></div>
            <p className="price-mode">On-demand monthly · 14 days free</p>
            <ul>
              <li><strong>{CONTINUITY_PRICE_TIERS[2].cloudRunsDisplay}</strong> fenced VPS runs / 30 days</li>
              <li>90s renewable leases + receipts</li>
              <li>Pre-action approval gates</li>
            </ul>
            <LandingPricingCtaPaid />
          </article>
        </div>
      </section>

      <aside id="expertise" className="proof-strip" aria-label="Public evidence">
        <div><strong>Live</strong><span>Live telemetry · production data</span></div>
        <div><strong>Honest</strong><span>No fake stories · no invented customers</span></div>
        <div><strong>Method</strong><span>Public methodology · canaries excluded</span></div>
        <div><strong><Link href="/expertise">Inspect →</Link></strong><span>Evidence and raw JSON</span></div>
      </aside>

      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <p>Hosted Hermes on a fenced VPS · closed-system · flat $10/month · cancel anytime.</p>
        <p><Link href="/how-it-works">How it works</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/blog">Blog</Link></p>
        <div><LandingPricingCtaPaid>{PRO_CTA}</LandingPricingCtaPaid></div>
      </footer>
    </main>
  );
}
