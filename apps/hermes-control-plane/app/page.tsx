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
      "ThumbGate Continuity is a fenced cloud VPS runner for autonomous agent work: coding, research, and computer-use tasks under LLM-as-a-Judge gates, 90-second renewable leases, and plan caps. You run and approve from the browser.",
  },
  {
    question: "Where do approvals happen?",
    answer:
      "In thumbgate.app. Approve or deny a tool call in the web workspace. There is no phone leash on this product.",
  },
  {
    question: "Do I need a phone app?",
    answer:
      "No. Continuity, billing, and approvals all live on thumbgate.app.",
  },
  {
    question: "Do I need to pair a Mac?",
    answer:
      "No. Continuity is fenced VPS execution. Sign in, start a trial or Pro plan, and run work on the cloud runner.",
  },
  {
    question: "How much does Continuity cost?",
    answer:
      "Pro Continuity is a flat $10/month for the fenced VPS runner, with a 14-day trial. Not per-token. Live list price is https://thumbgate.app/api/billing/plan.",
  },
  {
    question: "Is this a closed system?",
    answer:
      "Yes. Approvals, billing, and Continuity runs stay in thumbgate.app. Your org controls access. There is no phone leash on this product.",
  },
  {
    question: "What if the agent wants to kill a process or copy itself?",
    answer:
      "It pauses. You approve or deny in thumbgate.app. Conflicting goals without a human gate is how agents ship malware. Continuity does not auto-run that.",
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
          "Fenced cloud VPS Continuity for autonomous agents. Approvals happen in thumbgate.app.",
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
          <h1>Your agent keeps running when the machine sleeps.</h1>
          <p className="hero-lede">
            ThumbGate Continuity is a fenced Continuity VPS. Approve or deny in this browser. Flat $10/month. Not per-token. 14 days free.
          </p>
          <LandingAuthHero />
          <p className="signin-note">Sign in with email, Google, or Apple. Approvals stay in this browser.</p>
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


      <section id="when-it-stops" className="section-block" data-testid="sleep-vs-vps">
        <div className="section-heading">
          <p className="eyebrow">The failure that matters</p>
          <h2>When the machine sleeps, the agent dies.</h2>
          <p>Continuity is the always-on runner. Approvals stay in thumbgate.app. Not a second product.</p>
        </div>
        <div className="steps-grid">
          <article>
            <h3>Laptop / local session</h3>
            <p>Lid closes or the box sleeps. The watch process is gone. Nothing reports it. Work stops until you sit down again.</p>
          </article>
          <article>
            <h3>Continuity VPS</h3>
            <p>The run keeps a lease on a fenced VPS. You approve or deny in the browser. Flat $10/mo. No phone required.</p>
          </article>
        </div>
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
          <article><span>01</span><h3>Approve in thumbgate.app</h3><p>Risky tool calls pause in the browser. Approve or deny here. No phone leash.</p></article>
          <article><span>02</span><h3>LLM-as-a-Judge safety</h3><p>Pre-action checks block destructive commands, secret leaks, and spend overruns.</p></article>
          <article><span>03</span><h3>Fenced Cloud VPS runner</h3><p>Serverless Continuity execution with one active lease per task thread.</p></article>
        </div>
      </section>

      <section id="closed-system" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Closed-system · Zero leaks</p>
          <h2>Your data stays in your workspace.</h2>
          <p>
            Tool calls, approvals, and Continuity runs stay on thumbgate.app. Access is the signed-in org.
            There is no phone leash and no third-party approval surface on this product.
          </p>
        </div>
        <div className="steps-grid">
          <article>
            <span>01</span>
            <h3>Approvals in-app</h3>
            <p>Approve or deny in the browser. The sell is Continuity, not a companion app.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Fenced VPS</h3>
            <p>Work runs on an isolated Continuity runner with 90-second leases and receipts.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Flat $10, not metered tokens</h3>
            <p>Pro Continuity is a monthly list price. Live amount is /api/billing/plan.</p>
          </article>
        </div>
        <div className="hero-actions" style={{ marginTop: "32px" }}>
          <a href="#pricing" className="button button-primary" data-funnel-event="cloud_continuity_click">
            Start Continuity — $10/mo <span aria-hidden="true">→</span>
          </a>
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


      <section id="expertise" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Engineering expertise</p>
          <h2>Public Continuity telemetry, no invented customers.</h2>
          <p>
            Raw JSON at /api/expertise/stats. No founder case studies. No implied paying teams.
          </p>
        </div>
        <div className="steps-grid">
          <article>
            <span>01</span>
            <h3>Live telemetry</h3>
            <p>Success rates, p95 durations, and run counts from the production control plane.</p>
          </article>
          <article>
            <span>02</span>
            <h3>No fake stories</h3>
            <p>If a stranger has not paid, the page does not claim a team shipped faster.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Public methodology</h3>
            <p>Canary runs excluded. Privacy boundary documented. Endpoint: /api/expertise/stats.</p>
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
