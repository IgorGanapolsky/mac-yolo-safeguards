import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../BrandMark";
import { FailoverPathDemo } from "../FailoverPathDemo";
import { LandingPricingCtaPaid } from "../LandingAuthChrome";
import { FAQ_ITEMS } from "../landing-content";
import {
  CONTINUITY_PRICE_TIERS,
  CONTINUITY_ZERO_EGRESS,
  judgeGatesLabel,
} from "@/lib/continuity-pricing";

export const metadata: Metadata = {
  title: "How Hosted Hermes Works | ThumbGate",
  description:
    "Examples, approval flow, fenced VPS architecture, plan capacity, and FAQs for Hosted Hermes.",
};

const PUBLIC_PRICE_TIERS = CONTINUITY_PRICE_TIERS.filter((tier) => tier.id !== "team");
const PRO_CTA = "Start hosted Hermes — $10/mo";

export default function HowItWorksPage() {
  return (
    <main className="landing-shell">
      <nav className="topbar landing-nav" aria-label="How it works navigation">
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <div className="nav-actions">
          <Link href="/">Home</Link>
          <Link href="/#pricing" className="button button-small button-primary">Start hosted Hermes</Link>
        </div>
      </nav>

      <section id="main-content" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">How hosted Hermes works</p>
          <h1>Give it work. Keep control.</h1>
          <p>
            Hosted Hermes runs on a fenced VPS after your laptop sleeps. The detail below explains
            task examples, leases, capacity, and the actions that wait for your approval.
          </p>
          <p>Always on, even when your computer is off. Always awake. Always working. You own the work. We own the machine.</p>
          <div className="hero-actions">
            <Link href="/#pricing" className="button button-primary">See the $10 plan →</Link>
            <Link href="/security" className="button button-secondary">Read security details</Link>
          </div>
        </div>
      </section>

      <section id="example-tasks" className="section-block" data-testid="example-tasks">
        <div className="section-heading">
          <p className="eyebrow">Hand it real work</p>
          <h2>Tasks you can give hosted Hermes today.</h2>
          <p>
            Prompt in natural language. The fenced VPS keeps working after the laptop closes;
            money, customer, and production actions pause for your approval.
          </p>
        </div>
        <div className="steps-grid">
          <article>
            <a href="/api/auth/login" data-funnel-event="example_task_click" data-cta-id="watch-ci" data-testid="example-task-watch-ci">
              <span>01</span><h3>Watch CI overnight</h3>
              <p>Watch the repo. If CI goes red, draft a fix and pause before anything merges.</p>
            </a>
          </article>
          <article>
            <a href="/api/auth/login" data-funnel-event="example_task_click" data-cta-id="morning-digest" data-testid="example-task-morning-digest">
              <span>02</span><h3>Run the morning digest</h3>
              <p>Build the report on schedule and pause before sending a customer-facing email.</p>
            </a>
          </article>
          <article>
            <a href="/api/auth/login" data-funnel-event="example_task_click" data-cta-id="long-migration" data-testid="example-task-long-migration">
              <span>03</span><h3>Finish the long migration</h3>
              <p>Keep the migration moving and pause before any production or destructive step.</p>
            </a>
          </article>
        </div>
        <div className="steps-grid steps-grid-after-demo" data-testid="give-work-loop">
          <article><span>01</span><h3>Give hosted Hermes a job</h3><p>Sign in and type the work. Natural language. No desktop install.</p></article>
          <article><span>02</span><h3>Hosted Hermes works</h3><p>The agent keeps a renewable lease on a fenced VPS while the laptop sleeps.</p></article>
          <article><span>03</span><h3>Iterate and approve</h3><p>Guide the run here. Sensitive actions pause in thumbgate.app.</p></article>
        </div>
        <div className="hero-actions" style={{ marginTop: "32px" }}>
          <LandingPricingCtaPaid testId="give-work-cta" funnelEvent="give_work_click" ctaId="put-hosted-hermes-to-work">
            {PRO_CTA} <span aria-hidden="true">→</span>
          </LandingPricingCtaPaid>
        </div>
      </section>

      <section id="qualifier" className="section-block" data-testid="qualifier">
        <div className="section-heading">
          <p className="eyebrow">Two-minute qualifier</p>
          <h2>Does your coding agent die when the laptop sleeps?</h2>
          <p>Yes: test hosted Hermes for 14 days. No: this product is not for you.</p>
        </div>
        <div className="steps-grid">
          <article><h3>Yes</h3><p>Keep one agent alive on the VPS. If it dies with the laptop, the trial failed. Cancel anytime.</p></article>
          <article><h3>No</h3><p>Keep your current setup. Not a vault of n8n templates or a second workflow SKU.</p></article>
        </div>
      </section>

      <section id="one-offer" className="section-block" data-testid="one-offer">
        <div className="section-heading">
          <p className="eyebrow">One offer · one clock · one number</p>
          <h2>$10/mo. 14 days to keep one agent alive.</h2>
          <p>Keep one coding agent running 14 days on a fenced VPS. No invented refund or annual bonus stack.</p>
        </div>
      </section>

      <section id="when-it-stops" className="section-block" data-testid="sleep-vs-vps">
        <div className="section-heading">
          <p className="eyebrow">The failure that matters</p>
          <h2>When the machine sleeps, the agent dies.</h2>
          <p>Your coding agent dies when the laptop sleeps. Hosted on a fenced VPS. Not a laptop process.</p>
        </div>
        <div className="steps-grid">
          <article><h3>Laptop process</h3><p>A subscription runner — use the plan you already pay for — still dies with the lid.</p></article>
          <article><h3>Fenced VPS</h3><p>The task keeps a lease on the hosted box. You approve or deny in the browser.</p></article>
        </div>
      </section>

      <section id="setup" className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">Start hosted Hermes</p>
          <h2>Sign in. Start on VPS. Stay gated.</h2>
        </div>
        <ol className="setup-steps">
          <li><span>01</span><div><h3>Sign in</h3><p>Use email, Google, or Apple in this browser.</p></div></li>
          <li><span>02</span><div><h3>Start the $10 trial</h3><p>The hosted plan unlocks the fenced VPS runner under its plan caps.</p></div></li>
          <li><span>03</span><div><h3>Dispatch work</h3><p>Money, customer, or production actions pause before execution.</p></div></li>
        </ol>
      </section>

      <section id="approval-demo" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Approval path</p>
          <h2>Fenced VPS execution with renewable leases.</h2>
          <p>
            Tasks execute in isolated cloud sandboxes with 90-second renewable leases, receipt
            audit trails, and LLM-as-a-Judge interdiction before sensitive tool calls.
          </p>
        </div>
        <FailoverPathDemo />
        <div className="steps-grid steps-grid-after-demo">
          <article><span>01</span><h3>Approve in thumbgate.app</h3><p>Risky tool calls pause in the browser. Approve or deny here.</p></article>
          <article><span>02</span><h3>LLM-as-a-Judge safety</h3><p>Pre-action checks block destructive commands, secret leaks, and spend overruns.</p></article>
          <article><span>03</span><h3>Fenced Cloud VPS runner</h3><p>Hosted execution keeps one active lease per task thread.</p></article>
        </div>
      </section>

      <section id="closed-system" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Closed-system · Zero leaks</p>
          <h2>Your data stays in your workspace.</h2>
          <p>
            Tool calls, approvals, and hosted runs stay on thumbgate.app. Not ChatGPT Computer
            History, Windows Recall, or a Mac keylogger. The fenced VPS does not grab the cursor.
          </p>
        </div>
        <div className="steps-grid">
          <article><span>01</span><h3>Approvals in-app</h3><p>The sell is hosted Hermes, not a phone leash.</p></article>
          <article><span>02</span><h3>Fenced VPS</h3><p>Work runs with 90-second leases and receipts.</p></article>
          <article><span>03</span><h3>Flat $10</h3><p>Not metered tokens. Cancel anytime from billing.</p></article>
        </div>
      </section>

      <section id="capacity" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Transparent hosted capacity</p>
          <h2>Plan caps match the control-plane enforcer.</h2>
          <p>Surprise egress and idle fees: <strong>{CONTINUITY_ZERO_EGRESS.surpriseEgress}</strong>.</p>
        </div>
        <div className="capacity-matrix" data-testid="hosted-capacity-matrix" aria-label="Hosted Hermes capacity comparison">
          <div className="capacity-table-wrap">
            <table className="capacity-table">
              <thead><tr><th scope="col">Included</th>{PUBLIC_PRICE_TIERS.map((tier) => <th key={tier.id} scope="col">{tier.id === "free" ? "Free" : tier.id === "trial" ? "Trial" : "Pro"}</th>)}</tr></thead>
              <tbody>
                <tr><th scope="row">Purchase mode</th>{PUBLIC_PRICE_TIERS.map((tier) => <td key={`${tier.id}-mode`}>{tier.purchaseModeLabel}</td>)}</tr>
                <tr><th scope="row">Fenced VPS runs / 30d</th>{PUBLIC_PRICE_TIERS.map((tier) => <td key={`${tier.id}-runs`}>{tier.cloudRunsDisplay}</td>)}</tr>
                <tr><th scope="row">Concurrent active tasks</th>{PUBLIC_PRICE_TIERS.map((tier) => <td key={`${tier.id}-active`}>{tier.maxActiveTasksDisplay}</td>)}</tr>
                <tr><th scope="row">90s renewable lease</th>{PUBLIC_PRICE_TIERS.map((tier) => <td key={`${tier.id}-lease`}>{tier.renewableLeases ? "✓" : "—"}</td>)}</tr>
                <tr><th scope="row">LLM-as-a-Judge gates</th>{PUBLIC_PRICE_TIERS.map((tier) => <td key={`${tier.id}-judge`}>{judgeGatesLabel(tier.judgeGates)}</td>)}</tr>
                <tr><th scope="row">Surprise egress / idle fees</th><td colSpan={PUBLIC_PRICE_TIERS.length}>{CONTINUITY_ZERO_EGRESS.billingModel}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="capacity-footnote" data-testid="hosted-zero-egress">
            Networking trust: data transfer {CONTINUITY_ZERO_EGRESS.dataTransfer.toLowerCase()}, idle fees {CONTINUITY_ZERO_EGRESS.idleFees.toLowerCase()}. {CONTINUITY_ZERO_EGRESS.footnote}
          </p>
        </div>
      </section>

      <section id="faq" className="section-block" aria-labelledby="faq-heading">
        <div className="section-heading">
          <p className="eyebrow">Answers</p>
          <h2 id="faq-heading">What people ask before using hosted Hermes.</h2>
        </div>
        <div className="steps-grid">
          {FAQ_ITEMS.map((item) => <article key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}
        </div>
      </section>

      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <p>Examples, architecture, capacity, security, and answers for hosted Hermes.</p>
        <p><Link href="/">Home</Link> · <Link href="/security">Security</Link> · <Link href="/#pricing">Pricing</Link></p>
        <div><LandingPricingCtaPaid>{PRO_CTA}</LandingPricingCtaPaid></div>
      </footer>
    </main>
  );
}
