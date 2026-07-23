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
import styles from "./landing.module.css";

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

/**
 * Public marketing shell is static: no cookie jar reads and no D1 on first paint.
 * Session chrome hydrates via /api/me after paint (LandingAuthChrome).
 */
export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ThumbGate for Hermes",
    url: "https://thumbgate.app/",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web, macOS, iOS, Android",
    description: "Web dashboard for Hermes remote control, with optional VPS continuity when your machine is offline.",
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
        <LandingAuthNav />
      </nav>

      <section id="main-content" className="hero" tabIndex={-1}>
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Hermes remote control</p>
          <h1>Hermes dashboard<br /><span>from any browser.</span></h1>
          <p className="hero-lede">
            Chat and control your Hermes agents on the web. Continuity keeps eligible work running on a VPS when your Mac is offline.
          </p>
          <LandingAuthHero />
          <div className="hero-store-promo" aria-label="Get Hermes Mobile">
            <p className="hero-store-kicker">Prefer the native app?</p>
            <div className="hero-store-links">
              <a
                href="/go/android"
                className="store-badge store-badge-play"
                data-funnel-event="play_store_click"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="store-badge-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3.6 2.7c-.3.2-.5.6-.5 1.1v16.4c0 .5.2.9.5 1.1l.1.1 9.1-9.1v-.3L3.7 2.6l-.1.1zm12.1 7L12.4 12l3.3 2.3 3.9-2.2c.9-.5.9-1.4 0-1.9l-3.9-2.5zM4.1 20.8l8.2-8.2 2.6 1.8-9.6 5.5c-.5.3-1 .2-1.2.9zm0-17.6c.2 0 .5 0 .8-.2l9.6 5.5-2.6 1.8L4.1 2.6v.6z"/></svg>
                </span>
                <span className="store-badge-copy">
                  <small>GET IT ON</small>
                  <strong>Google Play</strong>
                </span>
              </a>
              <a
                href="/go/ios"
                className="store-badge store-badge-ios"
                data-funnel-event="app_store_click"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="store-badge-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M18.7 12.9c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3.1-1.6-1.3-.1-2.5.8-3.2.8s-1.7-.8-2.8-.7c-1.4.1-2.8.9-3.5 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.6.7 2.8.7 1.9-1 2.6-2c.8-1.1 1.1-2.2 1.1-2.3-.1 0-2.2-.8-2.3-3.4zM15.6 6.5c.6-.7 1-1.7.9-2.7-1 .1-2.1.6-2.8 1.4-.6.7-1.1 1.7-.9 2.6 1 .1 2.1-.5 2.8-1.3z"/></svg>
                </span>
                <span className="store-badge-copy">
                  <small>Download on the</small>
                  <strong>App Store</strong>
                </span>
              </a>
            </div>
            <p className="hero-store-note">Hermes Mobile · chat, approvals, and pairing from your phone</p>
          </div>
          <p className="signin-note">Hermes Web by ThumbGate. Continue with Google or Apple—no new password.</p>
          <div className="trust-row"><span>No inbound ports</span><span>Private-key pairing</span><span>Cloud only when enabled</span></div>
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <RemoteControlDiagram />
          <LandingAuthPanel />
        </nav>
      </section>

      <section id="pair" className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">Pair once</p>
          <h2>Connect your Mac. Open the dashboard.</h2>
        </div>
        <ol className="setup-steps">
          <li><span>01</span><div><h3>Run one installer</h3><p>Connector dials out over HTTPS. No inbound ports.</p></div></li>
          <li><span>02</span><div><h3>Approve the Mac</h3><p>Sign in and confirm the short code.</p></div></li>
          <li><span>03</span><div><h3>Pick offline behavior</h3><p>Pause, ask, or continue on Continuity (VPS).</p></div></li>
        </ol>
      </section>

      <section className="proof-strip">
        <div><strong>1</strong><span>signed device identity</span></div>
        <div><strong>0</strong><span>shared private keys</span></div>
        <div><strong>90s</strong><span>execution lease</span></div>
        <div><strong>24/7</strong><span>web dashboard</span></div>
      </section>

      <section id="how-it-works" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Dashboard + Continuity</p>
          <h2>Remote control. Keep going offline.</h2>
          <p>
            Free web dashboard while your Mac is online. Paid Continuity can fail eligible threads over to a fenced VPS runner when the machine disappears—one thread, one executor. Your Hermes work stays recoverable.
          </p>
        </div>
        <FailoverPathDemo />
        <div className="steps-grid steps-grid-after-demo">
          <article><span>01</span><h3>Web dashboard</h3><p>Chats, machines, and Leash controls from any browser.</p></article>
          <article><span>02</span><h3>Run on your Mac</h3><p>While online, work stays on the paired machine under a 90s lease.</p></article>
          <article><span>03</span><h3>Continuity (VPS)</h3><p>When the lid closes: pause, ask, or auto-continue on paid Continuity.</p></article>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="pricing-copy">
          <p className="eyebrow">Free control. Paid continuity.</p>
          <h2>Pay only when the Mac can&apos;t run the work.</h2>
        </div>
        <div className="price-grid">
          <article className="price-card">
            <div><span>Web Control</span><strong>$0<small>/month</small></strong></div>
            <ul>
              <li>Hermes web dashboard</li>
              <li>Signed machine pairing</li>
              <li>Synced chats while online</li>
              <li>Pause or ask when offline</li>
            </ul>
            <LandingPricingCtaFree />
          </article>
          <article className="price-card featured">
            <div><span>Cloud Continuity</span><BillingPlan /></div>
            <ul>
              <li>Everything in Web Control</li>
              <li>100 cloud continuations every 30 days</li>
              <li>VPS failover when Mac is offline</li>
              <li>14-day trial with 5 cloud runs</li>
            </ul>
            <LandingPricingCtaPaid />
          </article>
        </div>
      </section>


      <section id="mobile" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">On your phone</p>
          <h2>Same remote control. Push approvals in your pocket.</h2>
          <p>
            Hermes Mobile pairs to your Mac the same way as the web dashboard—chat, Leash approvals, and continuity settings when you&apos;re away from a browser.
          </p>
        </div>
        <div className="hero-store-links hero-store-links-lg">
          <a
            href="/go/android"
            className="store-badge store-badge-play"
            data-funnel-event="play_store_click"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="store-badge-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3.6 2.7c-.3.2-.5.6-.5 1.1v16.4c0 .5.2.9.5 1.1l.1.1 9.1-9.1v-.3L3.7 2.6l-.1.1zm12.1 7L12.4 12l3.3 2.3 3.9-2.2c.9-.5.9-1.4 0-1.9l-3.9-2.5zM4.1 20.8l8.2-8.2 2.6 1.8-9.6 5.5c-.5.3-1 .2-1.2.9zm0-17.6c.2 0 .5 0 .8-.2l9.6 5.5-2.6 1.8L4.1 2.6v.6z"/></svg>
            </span>
            <span className="store-badge-copy">
              <small>GET IT ON</small>
              <strong>Google Play</strong>
            </span>
          </a>
          <a
            href="/go/ios"
            className="store-badge store-badge-ios"
            data-funnel-event="app_store_click"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="store-badge-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M18.7 12.9c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3.1-1.6-1.3-.1-2.5.8-3.2.8s-1.7-.8-2.8-.7c-1.4.1-2.8.9-3.5 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.6.7 2.8.7 1.9-1 2.6-2c.8-1.1 1.1-2.2 1.1-2.3-.1 0-2.2-.8-2.3-3.4zM15.6 6.5c.6-.7 1-1.7.9-2.7-1 .1-2.1.6-2.8 1.4-.6.7-1.1 1.7-.9 2.6 1 .1 2.1-.5 2.8-1.3z"/></svg>
            </span>
            <span className="store-badge-copy">
              <small>Download on the</small>
              <strong>App Store</strong>
            </span>
          </a>
        </div>
      </section>

      <footer>
        <Link href="/" className="brand"><Mark /><span>ThumbGate <small>Hermes Web</small></span></Link>
        <p>Your Hermes work, on the web—and still running when the lid closes.</p>
      </footer>
    </main>
  );
}
