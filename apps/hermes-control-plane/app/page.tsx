import Link from "next/link";

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="topbar landing-nav">
        <Link href="/" className="brand"><Mark /><span>Hermes Control</span></Link>
        <div className="nav-actions">
          <a href="#how-it-works" className="nav-link">How it works</a>
          <a href="#pricing" className="nav-link">Pricing</a>
          <Link href="/api/auth/login" className="button button-small button-secondary">Sign in</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Local-first. Cloud-resilient.</p>
          <h1>Your Hermes work<br /><span>doesn’t stop with your Mac.</span></h1>
          <p className="hero-lede">Manage every thread from the web. When your paired machine disappears, a fenced cloud runner can continue the task without double-running it.</p>
          <div className="hero-actions">
            <Link href="/api/auth/login" className="button button-primary">
              Continue with Google or Apple <span aria-hidden="true">→</span>
            </Link>
            <a href="#how-it-works" className="button button-ghost">See the failover path</a>
          </div>
          <div className="trust-row"><span>Private-key pairing</span><span>90-second fenced leases</span><span>Audit trail</span></div>
        </div>

        <div className="hero-console" aria-label="Hermes failover status preview">
          <div className="console-header"><span className="console-title"><Mark /> Live routing</span><span className="status-chip online">Protected</span></div>
          <div className="route-map">
            <div className="route-node local-node"><span className="node-icon">⌘</span><div><strong>Igor’s MacBook</strong><small>Last seen 2m ago</small></div><span className="status-chip offline">Offline</span></div>
            <div className="route-line"><span /><b>Fenced handoff · lease #18</b><span /></div>
            <div className="route-node cloud-node"><span className="node-icon">☁</span><div><strong>Hermes Cloud Runner</strong><small>Working · 42 seconds</small></div><span className="status-chip active">Active</span></div>
          </div>
          <div className="task-card">
            <div className="task-meta"><span>THREAD / MARKET RESEARCH</span><span>RUNNING</span></div>
            <p>Continue the reliability benchmark and preserve the source trail…</p>
            <div className="progress"><span /></div>
          </div>
          <div className="audit-line"><span>10:42:18</span><strong>cloud.runner.claimed</strong><span>generation 18</span></div>
        </div>
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
          <article><span>01</span><h3>Pair without a gateway secret</h3><p>The connector creates a device key on the Mac. You approve its short code and fingerprint from the signed-in dashboard.</p></article>
          <article><span>02</span><h3>Route by live heartbeat</h3><p>Online tasks stay on your Hermes machine. Offline tasks pause, ask, or fail over automatically based on your policy.</p></article>
          <article><span>03</span><h3>Fence every execution</h3><p>Local and cloud workers claim expiring generations. A stale worker cannot overwrite the result after another runner takes over.</p></article>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div><p className="eyebrow">Simple launch pricing</p><h2>Keep the agent moving.</h2><p>Start with a 14-day trial and 5 cloud continuations. Cancel any time.</p></div>
        <article className="price-card"><div><span>Hermes Pro</span><strong>$29<small>/month</small></strong></div><ul><li>Unlimited paired-device heartbeats</li><li>100 cloud continuations every 30 days</li><li>Shared threads and audit history</li><li>Google and Apple sign-in</li></ul><Link href="/api/auth/login" className="button button-primary">Start free trial →</Link></article>
      </section>

      <footer><Link href="/" className="brand"><Mark /><span>Hermes Control</span></Link><p>Keep control when the machine disappears.</p></footer>
    </main>
  );
}
