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
import {
  CONTINUITY_EXECUTION_MODES,
  CONTINUITY_PRICE_TIERS,
  CONTINUITY_ZERO_EGRESS,
  judgeGatesLabel,
} from "@/lib/continuity-pricing";

/**
 * Public marketing shell is static: no cookie jar reads and no D1 on first paint.
 * Session chrome hydrates via /api/me after paint (LandingAuthChrome).
 *
 * Product truth (2026-08-17 CEO): ThumbGate.app sells Continuity on a fenced VPS
 * runner — not Mac pairing as the product. Hermes Mobile is the phone companion
 * (Leash approvals, alerts, voice) for that Continuity workspace.
 */
const FAQ_ITEMS = [
  {
    question: "What is ThumbGate?",
    answer:
      "ThumbGate Continuity is a fenced cloud VPS runner for autonomous agent work: coding, research, and computer-use tasks under LLM-as-a-Judge gates, 90-second renewable leases, and plan caps. You run Continuity from the browser — no Mac pairing required as the product path.",
  },
  {
    question: "What is Hermes Mobile?",
    answer:
      "Hermes Mobile is a separate iOS/Android app. It is not ThumbGate.app. Use it for biometric Leash approvals, lockscreen alerts, and voice when Continuity or agent work needs a human decision away from the desk.",
  },
  {
    question: "Why show Hermes Mobile on this site?",
    answer:
      "Continuity can run for hours on a VPS. Hermes Mobile is how you approve protected actions and get pinged only when a decision is required — without treating the phone as the Continuity control plane or billing surface.",
  },
  {
    question: "Do I need to pair a Mac with ThumbGate.app?",
    answer:
      "No. Continuity on ThumbGate.app is offered as fenced VPS execution. Sign in, start a Continuity trial or Pro plan, and run work on the cloud runner. Hermes desktop/mobile remain separate products for machine chat if you use them elsewhere.",
  },
  {
    question: "How much does Continuity cost?",
    answer:
      "Pro Continuity is a paid subscription for the fenced VPS runner (14-day trial available). Live list price is shown on this page and at https://thumbgate.app/api/billing/plan — currently $10/month for Pro, not a higher static FAQ price.",
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
        operatingSystem: "Web",
        description:
          "Fenced cloud VPS Continuity for autonomous agents with LLM-as-a-Judge guardrails. Hermes Mobile is an optional phone companion for approvals and alerts.",
        offers: [
          { "@type": "Offer", name: "Pro Continuity", price: "10", priceCurrency: "USD" },
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
          <p className="eyebrow"><span className="live-dot" /> Continuity · Fenced VPS</p>
          <h1>Agent work on a<br /><span>fenced Continuity VPS.</span></h1>
          <p className="hero-lede">
            ThumbGate Continuity runs autonomous coding, research, and computer-use workflows on a fenced cloud VPS with LLM-as-a-Judge pre-action gates, renewable 90s leases, and plan caps. No Mac pairing step — Continuity is the product.
          </p>
          <LandingAuthHero />
          <p className="signin-note">Continuity by ThumbGate. Continue with Google today — more providers activate once configured.</p>
          <div className="trust-row">
            <span>Fenced VPS runner</span>
            <span>LLM-as-a-Judge gates</span>
            <span>No Mac pair required</span>
          </div>
          <p className="signin-note" style={{ marginTop: "20px", marginBottom: "10px" }}>
            <strong>Hermes Mobile</strong> (optional phone app) — Leash approvals, push alerts, and voice. Not ThumbGate.app; Continuity and billing stay here.
          </p>
          <StoreBadgeRow aria-label="Hermes Mobile on Google Play and App Store" />
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <RemoteControlDiagram />
          <LandingAuthPanel />
        </nav>
      </section>

      <section id="setup" className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">Start Continuity</p>
          <h2>Sign in. Run on VPS. Stay gated.</h2>
        </div>
        <ol className="setup-steps">
          <li><span>01</span><div><h3>Sign in</h3><p>Google via AuthKit. Open the Continuity dashboard from any browser.</p></div></li>
          <li><span>02</span><div><h3>Start trial or Pro</h3><p>Continuity entitlement unlocks the fenced cloud VPS runner under your plan caps.</p></div></li>
          <li><span>03</span><div><h3>Dispatch work</h3><p>Agents run on Continuity VPS with pre-action gates — not on a paired laptop product path.</p></div></li>
        </ol>
      </section>

      <section id="how-it-works" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">How Continuity runs</p>
          <h2>Fenced VPS execution with renewable leases.</h2>
          <p>
            Tasks execute in isolated Continuity sandboxes with 90-second renewable leases, receipt audit trails, and LLM-as-a-Judge interdiction before sensitive tool calls.
          </p>
        </div>
        <FailoverPathDemo />
        <div className="steps-grid steps-grid-after-demo">
          <article><span>01</span><h3>Web Continuity console</h3><p>Sign in, manage billing, and dispatch Continuity runs from thumbgate.app.</p></article>
          <article><span>02</span><h3>LLM-as-a-Judge safety</h3><p>Pre-action checks block destructive commands, secret leaks, and spend overruns.</p></article>
          <article><span>03</span><h3>Fenced Cloud VPS runner</h3><p>Serverless Continuity execution with one active lease per task thread.</p></article>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="pricing-copy">
          <p className="eyebrow">Pro Continuity · live list price</p>
          <h2>Transparent Continuity capacity.</h2>
          <p>
            CoreWeave-style public specs: on-demand monthly Pro, short trial capacity, and reserved Team options.
            Caps match the control-plane enforcer — not marketing fiction. Egress, idle, and NAT-style fees:{" "}
            <strong>{CONTINUITY_ZERO_EGRESS.surpriseEgress}</strong>.
          </p>
        </div>
        <div className="price-grid">
          <article className="price-card">
            <div><span>Sign-in workspace</span><strong>$0<small>/start</small></strong></div>
            <p className="price-mode">Free · no Continuity runs</p>
            <ul>
              <li>Account + Continuity dashboard shell</li>
              <li>LLM-as-a-Judge policy surface</li>
              <li><strong>{CONTINUITY_PRICE_TIERS[0].cloudRunsDisplay}</strong> fenced VPS runs / 30 days</li>
              <li>No Mac pair required to explore</li>
            </ul>
            <LandingPricingCtaFree />
          </article>
          <article className="price-card featured">
            <div><span>Pro Continuity</span><BillingPlan /></div>
            <p className="price-mode">On-demand monthly · live Stripe list price</p>
            <ul>
              <li><strong>{CONTINUITY_PRICE_TIERS[2].cloudRunsDisplay}</strong> Continuity VPS runs / 30 days</li>
              <li>14-day trial: <strong>{CONTINUITY_PRICE_TIERS[1].cloudRunsDisplay}</strong> runs / 30 days</li>
              <li>90s renewable leases + receipts</li>
              <li>LLM-as-a-Judge pre-action gates</li>
              <li>Autonomous computer-use / web tasks</li>
            </ul>
            <LandingPricingCtaPaid />
          </article>
          <article className="price-card">
            <div><span>Team &amp; Enterprise</span><strong>$49<small>/month</small></strong></div>
            <p className="price-mode">Reserved capacity · contact for custom caps</p>
            <ul>
              <li>Everything in Pro Continuity</li>
              <li>Custom judge rubrics</li>
              <li>Higher Continuity run caps (contract)</li>
              <li>BYO API keys &amp; custom endpoints</li>
              <li>Priority Continuity leases</li>
            </ul>
            <LandingPricingCtaPaid />
          </article>
        </div>

        {/* CoreWeave-inspired capacity matrix — numbers from CONTINUITY_PRICE_TIERS only */}
        <div className="capacity-matrix" data-testid="continuity-capacity-matrix" aria-label="Continuity capacity comparison">
          <h3>Capacity matrix</h3>
          <div className="capacity-table-wrap">
            <table className="capacity-table">
              <thead>
                <tr>
                  <th scope="col">Included</th>
                  {CONTINUITY_PRICE_TIERS.map((tier) => (
                    <th key={tier.id} scope="col">{tier.id === "free" ? "Free" : tier.id === "trial" ? "Trial" : tier.id === "pro" ? "Pro" : "Team"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Purchase mode</th>
                  {CONTINUITY_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-mode`}>{tier.purchaseModeLabel}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Fenced VPS runs / 30d</th>
                  {CONTINUITY_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-runs`}>{tier.cloudRunsDisplay}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Concurrent active tasks</th>
                  {CONTINUITY_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-active`}>{tier.maxActiveTasksDisplay}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">90s renewable lease</th>
                  {CONTINUITY_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-lease`}>{tier.renewableLeases ? "✓" : "—"}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">LLM-as-a-Judge gates</th>
                  {CONTINUITY_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-judge`}>{judgeGatesLabel(tier.judgeGates)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Mac pair required</th>
                  {CONTINUITY_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-mac`}>{tier.macPairRequired ? "Yes" : "No"}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Surprise egress / idle fees</th>
                  <td colSpan={4}>{CONTINUITY_ZERO_EGRESS.billingModel}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="capacity-footnote">
            Live Pro list price from Stripe (<code>/api/billing/plan</code>). Run caps match{" "}
            <code>agent-governance</code> hard limits — dashboard shows remaining capacity after sign-in.
          </p>
        </div>

        <div className="execution-modes" data-testid="continuity-execution-modes" aria-label="Continuity execution modes">
          <h3>Execution modes</h3>
          <p className="capacity-footnote" style={{ marginTop: 0, marginBottom: 12 }}>
            Same idea as on-demand vs spot vs reserved capacity — mapped to Continuity product rails (no invented GPU SKUs).
          </p>
          <div className="execution-mode-grid">
            {CONTINUITY_EXECUTION_MODES.map((mode) => (
              <article key={mode.id} className="execution-mode-card" data-mode={mode.id}>
                <span className="price-mode">{mode.priority}</span>
                <strong>{mode.label}</strong>
                <small>{mode.priceHint}</small>
                <p>{mode.bestFor}</p>
              </article>
            ))}
          </div>
          <p className="capacity-footnote" data-testid="continuity-zero-egress">
            Networking trust: data transfer {CONTINUITY_ZERO_EGRESS.dataTransfer.toLowerCase()}, idle fees{" "}
            {CONTINUITY_ZERO_EGRESS.idleFees.toLowerCase()}. {CONTINUITY_ZERO_EGRESS.footnote}
          </p>
        </div>
      </section>

      <section id="mobile" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Why the store badges</p>
          <h2>ThumbGate.app vs Hermes Mobile</h2>
          <p>
            Two products. Continuity and billing live on <strong>ThumbGate.app</strong>. The store apps are <strong>Hermes Mobile</strong> — a phone companion for approvals and alerts, not a download of Continuity itself.
          </p>
        </div>

        <div className="steps-grid steps-grid-after-demo">
          <article>
            <span>01</span>
            <h3>ThumbGate.app · Continuity VPS</h3>
            <p>
              <strong>Product:</strong> Fenced cloud Continuity runner, dashboard, trial/Pro billing, and judge policy for agent work that stays in the cloud.
            </p>
            <p>
              <strong>Not:</strong> A Mac pairing installer product path. Continuity does not require pairing your laptop to ThumbGate.app.
            </p>
          </article>

          <article>
            <span>02</span>
            <h3>Hermes Mobile · Pocket Leash</h3>
            <p>
              <strong>Product:</strong> Native iOS/Android app for biometric approvals, lockscreen notifications, and voice when Continuity (or other Hermes agents) need a human decision.
            </p>
            <p>
              <strong>Not:</strong> ThumbGate Continuity, billing, or the VPS control plane. Install only if you want phone-side oversight.
            </p>
          </article>

          <article>
            <span>03</span>
            <h3>How they work together</h3>
            <p>
              <strong>Dispatch</strong> long Continuity runs from the web. <strong>Walk away.</strong> Hermes Mobile pings only when Leash or a milestone needs your sign-off.
            </p>
            <p>
              <strong>Same session story:</strong> Continuity owns cloud execution; Hermes Mobile owns on-the-go human gate — not a second Continuity SKU.
            </p>
          </article>
        </div>

        <div style={{ marginTop: "32px", textAlign: "center" }}>
          <p className="signin-note" style={{ marginBottom: "16px" }}>
            Download <strong>Hermes Mobile</strong> — not ThumbGate Continuity.
          </p>
          <StoreBadgeRow className="hero-store-links-lg" size="lg" aria-label="Download Hermes Mobile" />
        </div>
      </section>

      <section id="expertise" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Engineering expertise</p>
          <h2>Built from live production data, not static claims.</h2>
          <p>
            ThumbGate Continuity is maintained by the same engineering team that runs the Hermes stack. Our expertise page pairs original case studies with real control-plane telemetry — Continuity runs, uptime, and scale metrics.
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
          <h2 id="faq-heading">What people ask before using Continuity.</h2>
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
        <p>Fenced VPS Continuity · LLM-as-a-Judge guardrails.</p>
      </footer>
    </main>
  );
}
