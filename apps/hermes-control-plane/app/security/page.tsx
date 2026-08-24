import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../BrandMark";
import { LOCKED_OFFER } from "@/lib/content-lane";

export const metadata: Metadata = {
  title: "Security & data boundary",
  description:
    "How hosted Hermes contains an always-on agent: fenced VPS execution, renewable leases, LLM-as-a-Judge pre-action gates, in-browser human approvals, and content-free analytics.",
  alternates: { canonical: "/security" },
  openGraph: {
    type: "website",
    url: "https://thumbgate.app/security",
    siteName: "ThumbGate",
    title: "ThumbGate — Security & data boundary",
    description:
      "The agent control plane's containment model: fenced execution, human gates, receipts, and content-free telemetry.",
  },
};

export default function SecurityPage() {
  return (
    <main className="landing-shell">
      <nav className="topbar landing-nav" aria-label="Primary navigation">
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
      </nav>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Security &amp; data boundary</p>
          <h1>An agent control plane is a security product first.</h1>
          <p>
            Hosted Hermes runs an always-on agent on a fenced VPS. The agent touches
            repositories, inboxes, and infrastructure — so the boundary around it is the
            product. This page states that boundary plainly. No certifications are claimed
            here; every statement below describes shipped behavior you can verify.
          </p>
        </div>

        <div className="steps-grid">
          <article>
            <span>01</span>
            <h3>Fenced execution</h3>
            <p>
              Hosted Hermes tasks execute in isolated fenced VPS sandboxes — not on your
              machine, not in a shared pool identity. Every task thread holds a 90-second
              renewable lease; only the current unexpired lease-holder can complete a task,
              so a crashed or superseded run cannot race its replacement.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Human gates on consequences</h3>
            <p>
              Money, customer-facing, and production actions pause for your approval in the
              thumbgate.app browser. Before sensitive tool calls execute, an LLM-as-a-Judge
              policy layer checks for destructive commands, secret exfiltration, and spend
              overruns. The agent cannot approve itself.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Receipts, not surveillance</h3>
            <p>
              Every consequential action produces a receipt inside your authenticated
              workspace — an audit trail of what the agent actually did. Receipts exist for
              you, not for us: they never feed our analytics and never leave your workspace.
            </p>
          </article>
          <article>
            <span>04</span>
            <h3>Content-free analytics</h3>
            <p>
              Our telemetry is aggregate counters on a fixed event allowlist: an event name,
              a day, optional first-party campaign tokens. No prompts, no thread contents,
              no keystrokes, no email addresses, IP addresses, cookies, or user-agent
              strings. Free-form fields are rejected at the endpoint.
            </p>
          </article>
          <article>
            <span>05</span>
            <h3>Your runs stay yours</h3>
            <p>
              We do not train models on your data. Public stats on the expertise page are
              aggregates with canary runs excluded and organization identities never
              exposed. The methodology is published at /api/expertise/stats.
            </p>
          </article>
          <article>
            <span>06</span>
            <h3>The browser is untrusted</h3>
            <p>
              A signed-in browser session does not get full VPS access. Sessions without a
              matching capability cannot reach core commands, and gated actions still pause
              for explicit approval — a stolen tab is not a stolen agent.
            </p>
          </article>
        </div>

        <div className="section-heading" style={{ marginTop: "40px" }}>
          <h2>Verify it yourself</h2>
          <p>
            The machine-readable boundary lives at <a href="/llms.txt">/llms.txt</a>. The
            engineering write-up is on the <Link href="/blog">blog</Link> — start with
            &ldquo;Leases, receipts, and a judge&rdquo; and &ldquo;Your agent&rsquo;s
            telemetry should be content-free.&rdquo; Live aggregate stats:{" "}
            <a href="/api/expertise/stats">/api/expertise/stats</a>.
          </p>
        </div>

        <div className="hero-actions" style={{ marginTop: "24px" }}>
          <a href="/api/auth/login" className="button button-primary" data-funnel-event="security_cta_click">
            Start {LOCKED_OFFER.product} — {LOCKED_OFFER.price} <span aria-hidden="true">→</span>
          </a>
        </div>
        <p className="signin-note" style={{ marginTop: "16px" }}>
          {LOCKED_OFFER.product} runs on a {LOCKED_OFFER.host}; {LOCKED_OFFER.approvals}. {LOCKED_OFFER.trial}.
        </p>
      </section>

      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <p><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/blog">Blog</Link> · <Link href="/security">Security</Link></p>
      </footer>
    </main>
  );
}
