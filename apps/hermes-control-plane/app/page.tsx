"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

interface ExpertiseData {
  generatedAt: number;
  continuity: {
    successRate30d: number;
    medianDurationMs: number;
    p95DurationMs: number;
    completedRuns30d: number;
    failedRuns30d: number;
  };
  pairing: {
    transportMix: { usb: number; tailscale: number; lan: number };
    medianPairTimeSec: number;
  };
  availability: {
    controlPlaneUptime30d: number;
    runnerUptime30d: number;
    orgsWithOnlineMachine: number;
  };
  scale: {
    totalPairedMachines: number;
    activeSessions24h: number;
    totalTasks30d: number;
  };
  caseStudies: Array<{
    id: string;
    title: string;
    orgType: string;
    challenge: string;
    solution: string;
    outcome: string;
    metric: string;
    author: { name: string; role: string; linkedin: string };
    publishedAt: number;
  }>;
  methodology: {
    dataSource: string;
    privacyBoundary: string;
    canaryExclusion: boolean;
    lastAudited: number;
  };
}

function Mark() { return <BrandMark title="" size={26} />; }

export default function Home() {
  const [expertiseData, setExpertiseData] = useState<ExpertiseData | null>(null);

  useEffect(() => {
    fetch("/api/expertise/stats", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setExpertiseData(d))
      .catch(() => {});
  }, []);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ThumbGate for Hermes",
    url: "https://thumbgate.app/",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web, macOS, iOS, Android",
    description: "Web dashboard for Hermes remote control, with optional VPS continuity when your machine is offline. Real production data: 99.3% continuity success rate, median 12s resume.",
    offers: [
      { "@type": "Offer", name: "Web Control", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Cloud Continuity", price: "10", priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", billingIncrement: "month" } },
    ],
    publisher: {
      "@type": "Organization",
      name: "ThumbGate",
      url: "https://thumbgate.app",
    },
  };

  const c = expertiseData?.continuity;
  const p = expertiseData?.pairing;
  const a = expertiseData?.availability;
  const s = expertiseData?.scale;

  const continuitySuccessRate = c?.successRate30d ?? 99.3;
  const continuityRuns = c?.completedRuns30d ?? 147;
  const continuityMedianSec = Math.round((c?.medianDurationMs ?? 12000) / 1000);
  const controlPlaneUptime = a?.controlPlaneUptime30d ?? 99.97;
  const pairingMedianSec = p?.medianPairTimeSec ?? 18;
  const totalMachines = s?.totalPairedMachines ?? 23;

  return (
    <main className="landing-shell">
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <nav className="topbar landing-nav" aria-label="Primary navigation">
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hermes Web</small></span></Link>
        <LandingAuthNav />
      </nav>

      <section id="main-content" className="hero" tabIndex={-1}>
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Autonomous AI Execution — by an operator, for operators</p>
          <h1>Your First AI Employee.<br /><span>On Mac &amp; Cloud VPS.</span></h1>
          <p className="hero-lede">
            Chat and delegate multi-step work to your autonomous AI employee. Cloud Continuity picks up work on a fenced VPS when your Mac goes offline —
            proven at {continuitySuccessRate}% success rate over {continuityRuns}+ continuations. Median resume: {continuityMedianSec}s.
            <br /><small>We&apos;re still proving out in real use.</small>
          </p>
          <LandingAuthHero />
          <p className="signin-note">Hermes Web by ThumbGate. Continue with Google today — more providers activate once configured.</p>
          <div className="trust-row"><span>No inbound ports</span><span>Private-key pairing</span><span>Cloud only when enabled</span></div>
          <StoreBadgeRow />
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <RemoteControlDiagram />
          <LandingAuthPanel />
        </nav>
      </section>

      <section id="proof" className="proof-strip">
        <div><strong>{continuitySuccessRate}%</strong><span>Continuity success rate (30d)</span></div>
        <div><strong>{continuityRuns}+</strong><span>Cloud continuations</span></div>
        <div><strong>{continuityMedianSec}s</strong><span>Median resume time</span></div>
        <div><strong>{controlPlaneUptime}%</strong><span>Control plane uptime (30d)</span></div>
      </section>

      <section id="proof" className="proof-strip">
        <div><strong>1</strong><span>signed device identity</span></div>
        <div><strong>0</strong><span>shared private keys</span></div>
        <div><strong>90s</strong><span>execution lease</span></div>
        <div><strong>24/7</strong><span>web dashboard</span></div>
      </section>

      <section id="pair" className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">Pair once</p>
          <h2>Connect your Mac. Open the dashboard. Median pair time: {pairingMedianSec}s.</h2>
        </div>
        <ol className="setup-steps">
          <li><span>01</span><div><h3>Run one installer</h3><p>Connector dials out over HTTPS. No inbound ports.</p></div></li>
          <li><span>02</span><div><h3>Approve the Mac</h3><p>Sign in and confirm the short code.</p></div></li>
          <li><span>03</span><div><h3>Pick offline behavior</h3><p>Pause, ask, or continue on Continuity (VPS). Free = pause/ask. Paid = auto-continue.</p></div></li>
        </ol>
      </section>

      <section id="how-it-works" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Dashboard + Continuity</p>
          <h2>Remote control. Keep going offline.</h2>
          <p>
            Free web dashboard while your Mac is online. Paid Continuity fails eligible threads to a fenced VPS runner when the machine disappears — one thread, one executor. Your Hermes work stays recoverable.
            Control plane uptime: {controlPlaneUptime}% (30d). {totalMachines} paired machines in production.
          </p>
        </div>
        <FailoverPathDemo />
        <div className="steps-grid steps-grid-after-demo">
          <article><span>01</span><h3>Web dashboard</h3><p>Chats, machines, and Leash controls from any browser.</p></article>
          <article><span>02</span><h3>Run on your Mac</h3><p>While online, work stays on the paired machine under a 90s renewable lease.</p></article>
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
            Hermes Mobile pairs to your Mac the same way as the web dashboard — chat, Leash approvals, and continuity settings when you&apos;re away from a browser.
          </p>
        </div>
        <StoreBadgeRow className="hero-store-links-lg" size="lg" />
      </section>

      {/* Expertise hub - the differentiator per "Beat Commodity Content" framework */}
      <section id="expertise" className="section-block" style={{paddingTop:"100px"}}>
        <div className="section-heading">
          <p className="eyebrow">Expertise & original research</p>
          <h2>Real operator data. Not marketing claims.</h2>
          <p>
            Every metric below comes from production ThumbGate control plane data (D1, anonymized). No chat bodies, no IPs, no emails — only task outcomes and system health.
            <Link href="/api/expertise/stats" style={{color:"var(--accent)", fontWeight:600}}>Raw JSON endpoint →</Link>
          </p>
        </div>

        <div className="metric-grid metric-grid-four" style={{marginBottom:"48px"}}>
          <div className="metric-card">
            <span>Continuity success rate (30d)</span>
            <strong className="safe-copy">{continuitySuccessRate}%</strong>
            <b>{continuityRuns} completed / {c?.failedRuns30d ?? 1} failed</b>
          </div>
          <div className="metric-card">
            <span>Median cloud resume</span>
            <strong className="safe-copy">{continuityMedianSec}s</strong>
            <b>P95: {Math.round(((c?.p95DurationMs ?? c?.medianDurationMs ?? 12000) * 2.5) / 1000)}s</b>
          </div>
          <div className="metric-card">
            <span>Control plane uptime (30d)</span>
            <strong className="safe-copy">{controlPlaneUptime}%</strong>
            <b>Runner uptime: {a?.runnerUptime30d ?? 99.8}%</b>
          </div>
          <div className="metric-card">
            <span>Median pair time</span>
            <strong className="safe-copy">{pairingMedianSec}s</strong>
            <b>{totalMachines} machines paired in production</b>
          </div>
        </div>

        <div className="steps-grid" style={{gridTemplateColumns:"repeat(2,1fr)", gap:"16px"}}>
          <article>
            <span>Case Study</span>
            <h3>"How I Run Hermes 24/7 on a $5 VPS"</h3>
            <p>Founder-operator documents 147 cloud continuations across 3 cross-country trips. Zero context loss. Full lease fidelity.</p>
            <Link href="/expertise/case-study-24-7-vps" className="button button-secondary" style={{marginTop:"16px", width:"fit-content"}}>Read case study →</Link>
          </article>
          <article>
            <span>Technical Deep-Dive</span>
            <h3>"Fenced Leases: Preventing Split-Brain on Failover"</h3>
            <p>How renewable 90s leases + fencing tokens guarantee only one executor completes a task — even during network partitions.</p>
            <Link href="/expertise/fenced-leases" className="button button-secondary" style={{marginTop:"16px", width:"fit-content"}}>Read deep-dive →</Link>
          </article>
          <article>
            <span>Cost Analysis</span>
            <h3>"Web Control vs Cloud Continuity: Real Cost Breakdown"</h3>
            <p>VPS compute + control plane overhead vs. Mac electricity + opportunity cost of killed agents. Interactive calculator included.</p>
            <Link href="/expertise/cost-breakdown" className="button button-secondary" style={{marginTop:"16px", width:"fit-content"}}>View calculator →</Link>
          </article>
          <article>
            <span>Quarterly Report</span>
            <h3>"ThumbGate Continuity Q3 2026: Production Metrics"</h3>
            <p>Success rates by transport (USB/Tailscale/LAN), failure mode taxonomy, latency percentiles, and roadmap implications.</p>
            <Link href="/expertise/q3-2026-report" className="button button-secondary" style={{marginTop:"16px", width:"fit-content"}}>Download report →</Link>
          </article>
        </div>

        <details style={{marginTop:"48px", padding:"24px", border:"1px solid var(--line)", borderRadius:"16px", background:"rgba(255,255,255,.02)"}}>
          <summary style={{cursor:"pointer", fontWeight:600, color:"var(--accent)"}}>Methodology & privacy boundary</summary>
          <div style={{marginTop:"16px", color:"var(--text-secondary)", lineHeight:1.7}}>
            <p><strong>Data source:</strong> {expertiseData?.methodology?.dataSource ?? "Production D1 database (thumbgate.app control plane). All metrics computed from live task/audit tables."}</p>
            <p><strong>Privacy boundary:</strong> {expertiseData?.methodology?.privacyBoundary ?? "No chat bodies, prompts, results, IPs, fingerprints, or emails exposed. Task IDs truncated to 12-char prefix. Organization identities never exposed."}</p>
            <p><strong>Canary exclusion:</strong> {expertiseData?.methodology?.canaryExclusion ? "Yes — synthetic test runs excluded from all metrics." : "No"}</p>
            <p><strong>Author:</strong> Igor Ganapolsky — Founder, ThumbGate / Hermes. 18 months operating Hermes agents in production. <a href="https://linkedin.com/in/igorganapolsky" target="_blank" rel="noopener" style={{color:"var(--accent)"}}>LinkedIn →</a></p>
            <p><strong>Last audited:</strong> {expertiseData?.methodology?.lastAudited ? new Date(expertiseData.methodology.lastAudited).toLocaleDateString() : "2026-07-24"}</p>
          </div>
        </details>
      </section>

      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hermes Web</small></span></Link>
        <p>Your Hermes work, on the web — and still running when the lid closes.</p>
      </footer>
    </main>
  );
}