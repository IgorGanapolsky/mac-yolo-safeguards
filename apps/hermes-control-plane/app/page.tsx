import Link from "next/link";
import { BillingPlan } from "./BillingPlan";
import { FunnelSignals } from "./FunnelSignals";
import { formatAgo, formatLatency, getPublicTelemetry } from "@/lib/public-telemetry";

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

export default async function Home() {
  const telemetry = await getPublicTelemetry();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ThumbGate for Hermes",
    url: "https://thumbgate.app/",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web, macOS, iOS, Android",
    description: "Hermes chats and Leash controls on the web, with signed machine pairing and fenced cloud continuation.",
    offers: [
      { "@type": "Offer", name: "Web Control", price: "0", priceCurrency: "USD" },
    ],
  };

  return (
    <main className="landing-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <FunnelSignals />
      <nav className="topbar landing-nav">
        <Link href="/" className="brand"><Mark /><span>ThumbGate <small>Hermes Web</small></span></Link>
        <div className="nav-actions">
          <a href="#pair" className="nav-link">Pair</a>
          <a href="#how-it-works" className="nav-link">How it works</a>
          <a href="#pricing" className="nav-link">Pricing</a>
          <Link href="/api/auth/login" className="button button-small button-secondary" data-funnel-event="sign_in_click">Sign in</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Hermes-native. Web-ready.</p>
          <h1>Your Hermes chats<br /><span>from any screen.</span></h1>
          <p className="hero-lede">The dark, focused Hermes workspace you already know—adapted for desktop and mobile web. Your Mac runs the work locally; paid cloud continuity can take over when it goes offline.</p>
          <div className="hero-actions">
            <Link href="/api/auth/login" className="button button-primary" data-funnel-event="sign_in_click">
              Open Hermes on the web <span aria-hidden="true">→</span>
            </Link>
            <a href="#how-it-works" className="button button-ghost">See the failover path</a>
          </div>
          <p className="signin-note">Hermes Web by ThumbGate. Continue with Google or Apple—no new password.</p>
          <div className="trust-row"><span>No inbound ports</span><span>Private-key pairing</span><span>Cloud only when enabled</span></div>
        </div>

        <Link
          href="/api/auth/login"
          className="hero-console"
          aria-label="Live production telemetry — sign in to see your own dashboard"
          data-funnel-event="hero_console_click"
        >
          <div className="console-header"><span className="console-title"><Mark /> Live production telemetry</span><span className="status-chip online">Real receipts</span></div>
          <div className="route-map">
            <div className="route-node local-node"><span className="node-icon">⌘</span><div><strong>Machines online now</strong><small>Signed heartbeats, 2-minute window</small></div><span className="status-chip active">{telemetry ? telemetry.machinesOnlineNow : "—"}</span></div>
            <div className="route-line"><span /><b>Fenced cloud continuations · {telemetry ? telemetry.cloudRunsCompleted : "—"} completed</b><span /></div>
            <div className="route-node cloud-node"><span className="node-icon">☁</span><div><strong>P95 task completion</strong><small>Measured from real task receipts</small></div><span className="status-chip active">{telemetry ? formatLatency(telemetry.p95CompletionMs) : "—"}</span></div>
          </div>
          <div className="task-card">
            <div className="task-meta"><span>LAST CLOUD CONTINUATION</span><span>{telemetry ? formatAgo(telemetry.lastCloudRunAt) : "—"}</span></div>
            <p>{telemetry && telemetry.cloudRunsCompleted > 0 ? "Numbers on this card come from live production data, not a mockup. Sign in to see your own receipts." : "Awaiting first production receipts — this card renders live data, never a mockup."}</p>
          </div>
          <div className="audit-line"><span>tap to</span><strong>open your dashboard</strong><span>→</span></div>
        </Link>
      </section>

      <section id="pair" className="setup-section">
        <div className="section-heading"><p className="eyebrow">THREE-STEP PAIRING</p><h2>Connect once. Your chats appear.</h2><p>The connector dials out over HTTPS, creates a device key, opens a prefilled approval page, and keeps its local gateway credential on your machine.</p></div>
        <ol className="setup-steps">
          <li><span>01</span><div><h3>Run one installer</h3><p>The connector installs as an always-on service and opens ThumbGate for you.</p></div></li>
          <li><span>02</span><div><h3>Approve your Mac</h3><p>The short code is already filled. Verify the named machine and approve it.</p></div></li>
          <li><span>03</span><div><h3>Choose the offline rule</h3><p>Pause, ask first, or continue on a fenced cloud runner when the machine disappears.</p></div></li>
        </ol>
      </section>

      <section className="proof-strip">
        <div><strong>1</strong><span>signed device identity</span></div>
        <div><strong>0</strong><span>shared private keys</span></div>
        <div><strong>90s</strong><span>execution lease</span></div>
        <div><strong>24/7</strong><span>control plane</span></div>
      </section>

      <section id="how-it-works" className="section-block">
        <div className="section-heading"><p className="eyebrow">The safe handoff</p><h2>One thread. One executor. Always recoverable.</h2></div>
        <div className="steps-grid">
          <article><span>01</span><h3>Pair without a gateway secret</h3><p>The connector creates a device key on the machine. You approve its short code and fingerprint from the signed-in dashboard.</p></article>
          <article><span>02</span><h3>Route by live heartbeat</h3><p>Online tasks stay on your Hermes machine. Offline tasks pause, ask, or fail over automatically based on your policy.</p></article>
          <article><span>03</span><h3>Fence every execution</h3><p>Local and cloud workers claim expiring generations. A stale worker cannot overwrite the result after another runner takes over.</p></article>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="pricing-copy"><p className="eyebrow">Free control. Paid continuity.</p><h2>Pay for the infrastructure that keeps working.</h2><p>Web control of your own online Hermes machine stays free. Managed cloud execution is the paid product.</p></div>
        <div className="price-grid">
          <article className="price-card"><div><span>Web Control</span><strong>$0<small>/month</small></strong></div><ul><li>Signed machine pairing</li><li>Synced Hermes threads</li><li>Local task continuation while online</li><li>Pause or ask when offline</li></ul><Link href="/api/auth/login" className="button button-secondary" data-funnel-event="free_control_click">Use web control free →</Link></article>
          <article className="price-card featured"><div><span>Cloud Continuity</span><BillingPlan /></div><ul><li>Everything in Web Control</li><li>100 cloud continuations every 30 days</li><li>Automatic fenced failover</li><li>14-day trial with 5 cloud runs</li></ul><Link href="/api/auth/login" className="button button-primary" data-funnel-event="cloud_continuity_click">Try cloud continuity →</Link></article>
        </div>
      </section>

      <footer><Link href="/" className="brand"><Mark /><span>ThumbGate <small>Hermes Web</small></span></Link><p>Your Hermes workspace, wherever you are.</p></footer>
    </main>
  );
}
