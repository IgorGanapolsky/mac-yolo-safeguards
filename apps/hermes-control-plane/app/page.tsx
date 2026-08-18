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
import { HostingSelector } from "./HostingSelector";
import styles from "./landing.module.css";
import {
  CONTINUITY_PRICE_TIERS,
  CONTINUITY_ZERO_EGRESS,
  judgeGatesLabel,
} from "@/lib/continuity-pricing";

const PUBLIC_PRICE_TIERS = CONTINUITY_PRICE_TIERS.filter((tier) => tier.id !== "team");

/**
 * Public marketing shell is static: no cookie jar reads and no D1 on first paint.
 * Session chrome hydrates via /api/me after paint (LandingAuthChrome).
 *
 * Product truth: ThumbGate.app sells hosted Hermes on a fenced VPS.
 * Approvals happen in thumbgate.app itself. Do not offer a phone leash.
 * "Continuity" in 2026 means memory / session-handoff plugins — not this product.
 */
const FAQ_ITEMS = [
  {
    question: "What is ThumbGate?",
    answer:
      "Hosted Hermes on a fenced VPS with in-browser approvals.",
  },
  {
    question: "Why not just run another agent pilot on my laptop?",
    answer:
      "Pilots die when the machine sleeps. Scheduled work and watchers do not fire if the computer is off. Hosted Hermes is one always-on agent on a fenced VPS. You approve money, customer, or production actions in this browser. If it dies when the laptop sleeps, the trial failed.",
  },
  {
    question: "Where do approvals happen?",
    answer:
      "In thumbgate.app. Approve or deny a tool call in the web workspace. There is no phone leash on this product.",
  },
  {
    question: "Who approves money, customer, or production actions?",
    answer:
      "You do, in thumbgate.app. Automations can draft and run. Actions with financial, customer-facing, or production consequences pause for a human gate.",
  },
  {
    question: "Do I need a phone?",
    answer:
      "No. Billing and approvals live on thumbgate.app.",
  },
  {
    question: "How much does it cost?",
    answer:
      "$10/mo, 14-day trial. Cancel anytime. Not per-token. Live list price is https://thumbgate.app/api/billing/plan.",
  },
  {
    question: "What happens after the 14-day trial?",
    answer:
      "If you do not cancel, you are billed $10/month. Cancel anytime during the trial and you owe nothing.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancel anytime from billing in thumbgate.app. One offer, one clock, one number: $10/mo and 14 days. If the agent dies when the laptop sleeps, the trial failed. No cash-ROI refund.",
  },
  {
    question: "Is this a closed system?",
    answer:
      "Yes. Approvals, billing, and hosted runs stay in thumbgate.app. Your org controls access. There is no phone leash on this product.",
  },
  {
    question: "What if the agent wants to kill a process or copy itself?",
    answer:
      "It pauses. You approve or deny in thumbgate.app. Conflicting goals without a human gate is how agents ship malware. Hosted Hermes does not auto-run that.",
  },
  {
    question: "Can I run it on my machine instead?",
    answer:
      "Yes. Use Hosting on this page. Local runs directly on your machine and your data never leaves your computer. Local dies when the laptop sleeps. ThumbGate Cloud is the $10 always-on fenced VPS. Approvals stay in thumbgate.app.",
  },
  {
    question: "Is this a memory or session-handoff plugin?",
    answer:
      "No. Hosted Hermes is the always-on box: a fenced VPS. Approvals happen in thumbgate.app.",
  },
] as const;

const PRO_CTA = "Start hosted Hermes — $10/mo";

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "ThumbGate",
        url: "https://thumbgate.app/",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        description:
          "Hosted Hermes on a fenced VPS. Approvals happen in thumbgate.app.",
        offers: [
          { "@type": "Offer", name: "Hosted Hermes", price: "10", priceCurrency: "USD" },
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
            Always on, even when your computer is off. Hosted on a fenced VPS. Not a laptop process. Approve money, customer, or production actions in this browser. Flat $10/month. 14 days free. Cancel anytime.
          </p>
          <p className="signin-note">
            Automations can draft and run. Money, customer-facing, or production actions require your approval in this browser.
          </p>
          <LandingAuthHero />
          <p className="signin-note">Sign in with email, Google, or Apple. Approvals stay in this browser.</p>
          <div className="trust-row">
            <span>One offer · $10/mo</span>
            <span>One clock · 14-day trial</span>
            <span>Approvals in thumbgate.app</span>
          </div>
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <RemoteControlDiagram />
          <LandingAuthPanel />
        </nav>
      </section>

      <HostingSelector />

      <section id="qualifier" className="section-block" data-testid="qualifier">
        <div className="section-heading">
          <p className="eyebrow">Two-minute qualifier</p>
          <h2>Does your coding agent die when the laptop sleeps?</h2>
          <p>Yes — hosted Hermes is for you. No — this is not for you. We measure recovered runs after you start. No invented stranger stats.</p>
        </div>
        <div className="steps-grid">
          <article>
            <h3>Yes</h3>
            <p>Keep one agent alive 14 days on a VPS. Approve in the browser. If it dies when the laptop sleeps, the trial failed. Cancel anytime. No cash-ROI refund theater.</p>
            <p><a href="#pricing" className="button button-primary" data-funnel-event="cloud_continuity_click">{PRO_CTA}</a></p>
          </article>
          <article>
            <h3>No</h3>
            <p>This product is not for you. We do not sell restaurant call capture, home-services agency work, or a vault of workflows.</p>
          </article>
        </div>
      </section>

      <section id="one-offer" className="section-block" data-testid="one-offer">
        <div className="section-heading">
          <p className="eyebrow">One offer · one clock · one number</p>
          <h2>$10/mo. 14 days to keep one agent alive.</h2>
          <p>Drop the agent on a fenced VPS. Approvals stay at thumbgate.app. Not a vault of n8n templates. Not a second SKU.</p>
        </div>
        <div className="steps-grid">
          <article>
            <h3>The trial is execution</h3>
            <p>Keep one coding agent running 14 days on a fenced VPS. You approve in this browser. If the run dies when the laptop sleeps, the trial failed.</p>
          </article>
          <article>
            <h3>One path</h3>
            <p>Sign in. Start the $10 hosted Hermes trial. Dispatch work. No workflow dump, no annual bonus stack, no invented refund.</p>
          </article>
        </div>
      </section>

      <section id="when-it-stops" className="section-block" data-testid="sleep-vs-vps">
        <div className="section-heading">
          <p className="eyebrow">The failure that matters</p>
          <h2>When the machine sleeps, the agent dies.</h2>
          <p>Your coding agent dies when the laptop sleeps. A hosted VPS stays on. Approvals stay in thumbgate.app. Not a second product.</p>
        </div>
        <div className="steps-grid">
          <article>
            <h3>Laptop / local session</h3>
            <p>The laptop sleeps. The process is gone. Nothing reports it. Work stops until you sit down again.</p>
          </article>
          <article>
            <h3>Fenced VPS</h3>
            <p>The run keeps a lease on a hosted box. You approve or deny in the browser. Flat $10/mo. No phone required.</p>
          </article>
        </div>
      </section>
      <section id="setup" className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">Start hosted Hermes</p>
          <h2>Sign in. Run on VPS. Stay gated.</h2>
        </div>
        <ol className="setup-steps">
          <li><span>01</span><div><h3>Sign in</h3><p>Google via AuthKit. Open the hosted Hermes dashboard from any browser.</p></div></li>
          <li><span>02</span><div><h3>Start the $10 trial</h3><p>A paid plan unlocks the fenced cloud VPS runner under your plan caps.</p></div></li>
          <li><span>03</span><div><h3>Dispatch work</h3><p>Agents run on a fenced VPS with pre-action gates. Not on your laptop.</p></div></li>
        </ol>
      </section>

      <section id="how-it-works" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">How hosted Hermes runs</p>
          <h2>Fenced VPS execution with renewable leases.</h2>
          <p>
            Tasks execute in isolated fenced cloud VPS sandboxes with 90-second renewable leases, receipt audit trails, and LLM-as-a-Judge interdiction before sensitive tool calls.
          </p>
        </div>
        <FailoverPathDemo />
        <div className="steps-grid steps-grid-after-demo">
          <article><span>01</span><h3>Approve in thumbgate.app</h3><p>Risky tool calls pause in the browser. Approve or deny here. No phone leash.</p></article>
          <article><span>02</span><h3>LLM-as-a-Judge safety</h3><p>Pre-action checks block destructive commands, secret leaks, and spend overruns.</p></article>
          <article><span>03</span><h3>Fenced Cloud VPS runner</h3><p>Hosted execution with one active lease per task thread.</p></article>
        </div>
      </section>

      <section id="closed-system" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Closed-system · Zero leaks</p>
          <h2>Your data stays in your workspace.</h2>
          <p>
            Tool calls, approvals, and hosted runs stay on thumbgate.app. Access is the signed-in org.
            There is no phone leash and no third-party approval surface on this product.
          </p>
        </div>
        <div className="steps-grid">
          <article>
            <span>01</span>
            <h3>Approvals in-app</h3>
            <p>Approve or deny in the browser. The sell is hosted Hermes, not a companion app.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Fenced VPS</h3>
            <p>Work runs on an isolated fenced cloud VPS runner with 90-second leases and receipts.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Flat $10, not metered tokens</h3>
            <p>Hosted Hermes is a monthly list price. Live amount is /api/billing/plan. Cancel anytime.</p>
          </article>
        </div>
        <div className="hero-actions" style={{ marginTop: "32px" }}>
          <a href="#pricing" className="button button-primary" data-funnel-event="cloud_continuity_click">
            {PRO_CTA} <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="pricing-copy">
          <p className="eyebrow">Hosted Hermes · $10/mo · 14 days free · cancel anytime</p>
          <h2>Transparent hosted capacity.</h2>
          <p>
            Public plan caps only. We measure recovered runs, approvals completed, and VPS capacity after you start — not invented stranger stats.
            Caps match the control-plane enforcer. Egress, idle, and NAT-style fees:{" "}
            <strong>{CONTINUITY_ZERO_EGRESS.surpriseEgress}</strong>.
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
              <li>No laptop required. Sign in from any browser.</li>
            </ul>
            <LandingPricingCtaFree />
          </article>
          <article className="price-card featured" data-testid="price-card-pro">
            <div><span>Hosted Hermes</span><BillingPlan /></div>
            <p className="price-mode">On-demand monthly · $10 · 14 days free · cancel anytime</p>
            <ul>
              <li><strong>{CONTINUITY_PRICE_TIERS[2].cloudRunsDisplay}</strong> fenced VPS runs / 30 days</li>
              <li>14-day trial: <strong>{CONTINUITY_PRICE_TIERS[1].cloudRunsDisplay}</strong> runs / 30 days</li>
              <li>90s renewable leases + receipts</li>
              <li>LLM-as-a-Judge pre-action gates</li>
              <li>Autonomous computer-use / web tasks</li>
            </ul>
            <LandingPricingCtaPaid />
          </article>
        </div>

        <div className="capacity-matrix" data-testid="hosted-capacity-matrix" aria-label="Hosted Hermes capacity comparison">
          <h3>Capacity matrix</h3>
          <div className="capacity-table-wrap">
            <table className="capacity-table">
              <thead>
                <tr>
                  <th scope="col">Included</th>
                  {PUBLIC_PRICE_TIERS.map((tier) => (
                    <th key={tier.id} scope="col">{tier.id === "free" ? "Free" : tier.id === "trial" ? "Trial" : tier.id === "pro" ? "Pro" : "Team"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Purchase mode</th>
                  {PUBLIC_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-mode`}>{tier.purchaseModeLabel}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Fenced VPS runs / 30d</th>
                  {PUBLIC_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-runs`}>{tier.cloudRunsDisplay}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Concurrent active tasks</th>
                  {PUBLIC_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-active`}>{tier.maxActiveTasksDisplay}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">90s renewable lease</th>
                  {PUBLIC_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-lease`}>{tier.renewableLeases ? "✓" : "—"}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">LLM-as-a-Judge gates</th>
                  {PUBLIC_PRICE_TIERS.map((tier) => (
                    <td key={`${tier.id}-judge`}>{judgeGatesLabel(tier.judgeGates)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Surprise egress / idle fees</th>
                  <td colSpan={PUBLIC_PRICE_TIERS.length}>{CONTINUITY_ZERO_EGRESS.billingModel}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="capacity-footnote">
            Live Pro list price from Stripe (<code>/api/billing/plan</code>). Run caps match{" "}
            <code>agent-governance</code> hard limits — dashboard shows remaining capacity after sign-in.
          </p>
          <p className="capacity-footnote" data-testid="hosted-zero-egress">
            Networking trust: data transfer {CONTINUITY_ZERO_EGRESS.dataTransfer.toLowerCase()}, idle fees{" "}
            {CONTINUITY_ZERO_EGRESS.idleFees.toLowerCase()}. {CONTINUITY_ZERO_EGRESS.footnote}
          </p>
        </div>
      </section>


      <section id="expertise" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Operator telemetry</p>
          <h2>Public hosted telemetry, no invented customers.</h2>
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
          <h2 id="faq-heading">What people ask before using hosted Hermes.</h2>
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
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <p>Hosted Hermes on a fenced VPS · closed-system · flat $10/month · cancel anytime.</p>
        <p><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p>
        <p><a href="#pricing" className="button button-primary" data-funnel-event="cloud_continuity_click">{PRO_CTA}</a></p>
      </footer>
    </main>
  );
}
