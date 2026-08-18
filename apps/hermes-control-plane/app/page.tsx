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
 * Product truth (2026-08-17 CEO): ThumbGate.app sells Cloud Continuity on a VPS.
 * Approvals happen in thumbgate.app itself. Do not offer a phone leash.
 */
const FAQ_ITEMS = [
  {
    question: "What is ThumbGate?",
    answer:
      "ThumbGate is a 24/7 cloud runner for autonomous AI agent work: coding, research, and computer-use tasks under LLM-as-a-Judge gates, 90-second renewable leases, and plan caps. You run and approve directly from the browser.",
  },
  {
    question: "Where do approvals happen?",
    answer:
      "In thumbgate.app. Approve or deny any tool call in the web workspace with 1 click. Zero phone tethering required.",
  },
  {
    question: "Do I need a phone app or background daemon?",
    answer:
      "No. Workspace execution, billing, and safety approvals all live directly on thumbgate.app in your browser.",
  },
  {
    question: "Do I need to pair a local computer?",
    answer:
      "No. ThumbGate runs in fenced cloud VPS sandboxes. Sign in, start a trial or Pro plan, and dispatch autonomous work immediately.",
  },
  {
    question: "How much does it cost?",
    answer:
      "Pro plan is a flat $10/month with 100 cloud runs and a 14-day free trial. Not billed per-token. Live pricing endpoint is https://thumbgate.app/api/billing/plan.",
  },
  {
    question: "Is this a closed system?",
    answer:
      "Yes. Tool calls, audit receipts, and sessions remain strictly isolated in your workspace. Zero data exfiltration.",
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
          "24/7 Fenced cloud VPS runner for autonomous agents with in-browser LLM-as-a-Judge safety gates.",
        offers: [
          { "@type": "Offer", name: "Pro Plan", price: "10", priceCurrency: "USD" },
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
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Cloud Runner</small></span></Link>
        <LandingAuthNav />
      </nav>

      <section id="main-content" className="hero" tabIndex={-1}>
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> 24/7 Cloud AI Engineer · Fenced VPS</p>
          <h1>Autonomous agents on an<br /><span>isolated Cloud VPS sandbox.</span></h1>
          <p className="hero-lede">
            Your AI agents work 24/7 in fenced cloud sandboxes. Approve or deny sensitive tool calls in thumbgate.app with 1 click. Flat $10/month. 14 days free.
          </p>
          <LandingAuthHero />
          <p className="signin-note">Continuity by ThumbGate. Continue with Google today — get instant sandbox access.</p>
          <div className="trust-row">
            <span>Fenced VPS runner</span>
            <span>Closed-system · zero leaks</span>
            <span>Flat $10/month</span>
          </div>
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
          <li><span>01</span><div><h3>Sign in</h3><p>Google via AuthKit. Open your private workspace from any browser.</p></div></li>
          <li><span>02</span><div><h3>Start 14-day trial</h3><p>Unlocks the 24/7 Cloud VPS runner with isolated sandboxes under your plan caps.</p></div></li>
          <li><span>03</span><div><h3>Dispatch &amp; Approve</h3><p>Agents execute autonomously with LLM-as-a-Judge pre-action gates on sensitive actions.</p></div></li>
        </ol>
      </section>

      <section id="how-it-works" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2>Fenced VPS execution with renewable leases.</h2>
          <p>
            Tasks execute in isolated cloud sandboxes with 90-second renewable leases, cryptographic receipt logs, and LLM-as-a-Judge interdiction before sensitive actions.
          </p>
        </div>
        <FailoverPathDemo />
        <div className="steps-grid steps-grid-after-demo">
          <article><span>01</span><h3>In-browser approvals</h3><p>Sensitive tool calls pause in the browser. You retain complete execution authority with one-click approvals.</p></article>
          <article><span>02</span><h3>LLM-as-a-Judge safety</h3><p>Pre-action checks block destructive commands, secret leaks, and unauthorized spend.</p></article>
          <article><span>03</span><h3>Fenced Cloud VPS runner</h3><p>Serverless cloud execution with isolated sandboxes and 90s renewable leases.</p></article>
        </div>
      </section>

      <section id="closed-system" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Closed-system · Zero leaks</p>
          <h2>Your data stays in your workspace.</h2>
          <p>
            Tool calls, audit receipts, and agent sessions remain strictly isolated within your organization.
            Zero external data exfiltration, zero hardware dependency.
          </p>
        </div>
        <div className="steps-grid">
          <article>
            <span>01</span>
            <h3>Approvals in-app</h3>
            <p>Approve or deny directly in the browser workspace with full context and command previews.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Fenced VPS Sandboxes</h3>
            <p>Tasks run on isolated cloud runners with deterministic 90-second renewable leases.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Flat $10, not metered tokens</h3>
            <p>Pro plan is a flat monthly list price. Live pricing endpoint: /api/billing/plan.</p>
          </article>
        </div>
        <div className="hero-actions" style={{ marginTop: "32px" }}>
          <a href="#pricing" className="button button-primary" data-funnel-event="cloud_continuity_click">
            Start Cloud Runner — $10/mo <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="pricing-copy">
          <p className="eyebrow">Pro Plan · live list price</p>
          <h2>Transparent Continuity capacity.</h2>
          <p>
            Public specs: on-demand monthly Pro, 14-day free trial, and reserved Team options.
            Caps match the control-plane enforcer — not marketing fiction. Egress, idle, and NAT fees:{" "}
            <strong>{CONTINUITY_ZERO_EGRESS.surpriseEgress}</strong>.
          </p>
        </div>
        <div className="price-grid">
          <article className="price-card">
            <div><span>Starter</span><strong>$0<small>/start</small></strong></div>
            <p className="price-mode">Free · explore workspace</p>
            <ul>
              <li>Account + Cloud dashboard shell</li>
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
              <li><strong>{CONTINUITY_PRICE_TIERS[2].cloudRunsDisplay}</strong> Cloud VPS runs / 30 days</li>
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
              <li>Everything in Pro Plan</li>
              <li>Custom judge rubrics</li>
              <li>Higher Cloud VPS run caps (contract)</li>
              <li>BYO API keys &amp; custom endpoints</li>
              <li>Priority runner sandboxes</li>
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


      <section id="expertise" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Engineering expertise</p>
          <h2>Public Continuity telemetry, no invented customers.</h2>
          <p>
            Live telemetry endpoint at /api/expertise/stats. Transparent methodology and verified execution data.
          </p>
        </div>
        <div className="steps-grid">
          <article>
            <span>01</span>
            <h3>Live telemetry</h3>
            <p>Success rates, p95 durations, and active run counts computed directly from the production control plane.</p>
          </article>
          <article>
            <span>02</span>
            <h3>No fake stories</h3>
            <p>Zero fabricated testimonials or inflated claims. Verified telemetry with full methodology transparency.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Public methodology</h3>
            <p>Canary runs excluded. Strict privacy boundary documented. Live raw JSON: /api/expertise/stats.</p>
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
        <p>Fenced VPS Continuity · closed-system · flat $10/month.</p>
        <p><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p>
        <p><a href="#pricing" className="button button-primary" data-funnel-event="cloud_continuity_click">Start Continuity — $10/mo</a></p>
      </footer>
    </main>
  );
}
