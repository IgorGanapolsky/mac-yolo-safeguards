import Link from "next/link";
import { BillingPlan } from "./BillingPlan";
import { FunnelSignals } from "./FunnelSignals";
import { currentSession } from "@/lib/auth";
import styles from "./landing.module.css";

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

export default async function Home() {
  const session = await currentSession();
  const workspaceHref = session ? "/dashboard" : "/api/auth/login";
  const workspaceEvent = session ? "dashboard_open_click" : "sign_in_click";
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
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <FunnelSignals />
      <nav className="topbar landing-nav" aria-label="Primary navigation">
        <Link href="/" className="brand"><Mark /><span>ThumbGate <small>Hermes Web</small></span></Link>
        <div className="nav-actions">
          <a href="#pair" className="nav-link">Pair</a>
          <a href="#how-it-works" className="nav-link">How it works</a>
          <a href="#pricing" className="nav-link">Pricing</a>
          {session ? (
            <div className={styles.sessionNav} aria-label="Authenticated session actions">
              <Link href="/dashboard" className={`button button-small button-secondary ${styles.dashboardButton}`} data-funnel-event="dashboard_open_click">Open dashboard</Link>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className={`button button-small ${styles.signOutButton}`}>Sign out</button>
              </form>
            </div>
          ) : (
            <Link href="/api/auth/login" className="button button-small button-secondary" data-funnel-event="sign_in_click">Sign in</Link>
          )}
        </div>
      </nav>

      <section id="main-content" className="hero" tabIndex={-1}>
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Hermes-native. Web-ready.</p>
          <h1>Your Hermes chats<br /><span>from any screen.</span></h1>
          <p className="hero-lede">The dark, focused Hermes workspace you already know—adapted for desktop and mobile web. Your Mac runs the work locally; paid cloud continuity can take over when it goes offline.</p>
          <div className="hero-actions">
            <Link href={workspaceHref} className="button button-primary" data-funnel-event={workspaceEvent}>
              Open Hermes on the web <span aria-hidden="true">→</span>
            </Link>
            <a href="#how-it-works" className="button button-ghost">See the failover path</a>
          </div>
          <p className="signin-note">Hermes Web by ThumbGate. Continue with Google or Apple—no new password.</p>
          <div className="trust-row"><span>No inbound ports</span><span>Private-key pairing</span><span>Cloud only when enabled</span></div>
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <div className="console-header">
            <span className="console-title"><Mark /> Your workspace is private</span>
            <span className="action-label">{session ? "Session active" : "Sign-in required"}</span>
          </div>
          <div className="landing-action-list">
            {session ? (
              <Link className="landing-action" href="/dashboard" data-funnel-event="dashboard_open_click">
                <span className="action-icon" aria-hidden="true">⌘</span>
                <span><strong>Open private dashboard</strong><small>Your authenticated session is active. Workspace data still loads only inside the private dashboard.</small></span>
                <b aria-hidden="true">→</b>
              </Link>
            ) : (
              <Link className="landing-action" href="/api/auth/login" data-funnel-event="sign_in_click">
                <span className="action-icon" aria-hidden="true">⌘</span>
                <span><strong>Open private dashboard</strong><small>Authenticate before any chats, machines, tasks, receipts, or live routing are loaded.</small></span>
                <b aria-hidden="true">→</b>
              </Link>
            )}
            <a className="landing-action" href="#pair">
              <span className="action-icon" aria-hidden="true">+</span>
              <span><strong>Pair your Mac</strong><small>Read the public setup steps, then sign in to approve the short code.</small></span>
              <b aria-hidden="true">→</b>
            </a>
            <a className="landing-action" href="#pricing">
              <span className="action-icon" aria-hidden="true">☁</span>
              <span><strong>Review plans</strong><small>Compare public plan details without exposing workspace activity.</small></span>
              <b aria-hidden="true">→</b>
            </a>
          </div>
          <p className="honesty-note">No workspace telemetry is fetched or rendered on this public page.</p>
          {session ? <p className={styles.sessionNotice}>This browser has an active session. Sign out before leaving a shared device.</p> : null}
        </nav>
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
          <article className="price-card"><div><span>Web Control</span><strong>$0<small>/month</small></strong></div><ul><li>Signed machine pairing</li><li>Synced Hermes threads</li><li>Local task continuation while online</li><li>Pause or ask when offline</li></ul><Link href={workspaceHref} className="button button-secondary" data-funnel-event="free_control_click">Use web control free →</Link></article>
          <article className="price-card featured"><div><span>Cloud Continuity</span><BillingPlan /></div><ul><li>Everything in Web Control</li><li>100 cloud continuations every 30 days</li><li>Automatic fenced failover</li><li>14-day trial with 5 cloud runs</li></ul><Link href={workspaceHref} className="button button-primary" data-funnel-event="cloud_continuity_click">Try cloud continuity →</Link></article>
        </div>
      </section>

      <footer><Link href="/" className="brand"><Mark /><span>ThumbGate <small>Hermes Web</small></span></Link><p>Your Hermes workspace, wherever you are.</p></footer>
    </main>
  );
}
