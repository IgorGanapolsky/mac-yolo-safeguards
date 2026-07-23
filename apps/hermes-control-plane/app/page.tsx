import Link from "next/link";
import { BillingPlan } from "./BillingPlan";
import { FailoverPathDemo } from "./FailoverPathDemo";
import { FunnelSignals } from "./FunnelSignals";
import {
  LandingAuthHero,
  LandingAuthNav,
  LandingAuthPanel,
  LandingPricingCtaFree,
  LandingPricingCtaPaid,
} from "./LandingAuthChrome";
import { RemoteControlDiagram } from "./RemoteControlDiagram";
import styles from "./landing.module.css";

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

/**
 * Public marketing shell is static: no cookie jar reads and no D1 on first paint.
 * Session chrome hydrates via /api/me after paint (LandingAuthChrome).
 */
export default function Home() {
  const faqs = [
    {
      question: "What is ThumbGate?",
      answer: "ThumbGate lets you chat with and approve your Hermes agents from any phone or browser, while your Mac keeps doing the actual work. It also runs a self-improving firewall in the background, turning your thumbs feedback into approval gates over time.",
    },
    {
      question: "What happens when the paired Mac goes offline?",
      answer: "Free Web Control pauses or asks you first. Cloud Continuity (trial or paid) can pick up an eligible task on a fenced 90-second cloud lease, on the same thread — this is a new capability we're still proving out in real use.",
    },
    {
      question: "Does ThumbGate upload the Mac's gateway credential?",
      answer: "No. The connector creates a separate device key, dials out over HTTPS, and keeps the local gateway credential on the paired machine. ThumbGate needs no inbound port.",
    },
  ];
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://thumbgate.app/#organization",
        name: "ThumbGate",
        url: "https://thumbgate.app/",
        logo: "https://thumbgate.app/favicon.svg",
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://thumbgate.app/#software",
        name: "ThumbGate for Hermes",
        url: "https://thumbgate.app/",
        provider: { "@id": "https://thumbgate.app/#organization" },
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web, macOS, iOS, Android",
        description: "Control your Hermes agents from your phone or any browser while your Mac does the work. Includes signed machine pairing, fenced cloud continuation, and a self-improving firewall built from thumbs feedback.",
        offers: [
          { "@type": "Offer", name: "Web Control", price: "0", priceCurrency: "USD" },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": "https://thumbgate.app/#faq",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
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
        <Link href="/" className="brand"><Mark /><span>ThumbGate <small>Hermes Web</small></span></Link>
        <LandingAuthNav />
      </nav>

      <section id="main-content" className="hero" tabIndex={-1}>
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Hermes-native · works on any phone or browser</p>
          <h1>Control your Hermes agents<br /><span>from anywhere.</span></h1>
          <p className="hero-lede">Chat, approve, and steer your agents from your phone — your Mac keeps doing the work.</p>
          <LandingAuthHero />
          <p className="mini-caption">Includes a self-improving firewall: your thumbs feedback quietly becomes approval gates over time.</p>
          <p className="mini-caption">Hermes Web by ThumbGate. Sign in with email or Google today — more providers activate once configured.</p>
          <div className="trust-row"><span>No inbound ports</span><span>Private-key pairing</span><span>Cloud only when enabled</span></div>
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <RemoteControlDiagram />
          <LandingAuthPanel />
        </nav>
      </section>

      <section id="pair" className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">THREE-STEP PAIRING</p>
          <h2>Pair a Mac that already runs Hermes.</h2>
          <p>Your gateway credential never leaves that Mac. Chats appear after you sign in and approve the device.</p>
        </div>
        <ol className="setup-steps">
          <li>
            <span>01</span>
            <div>
              <h3>Run the connector installer</h3>
              <p>
                On a Mac with Hermes already installed, the installer starts an always-on connector service (while that Mac is on)
                and opens ThumbGate for approval.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Sign in and approve the Mac</h3>
              <p>
                In the happy path the short code is prefilled in the dashboard URL. Verify the named machine and fingerprint, then approve.
                If the code is missing, paste the eight-character code from the installer output.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Choose the offline rule</h3>
              <p>
                Free web control defaults to pause or ask when the Mac disappears.
                Automatic fenced cloud continuation requires Cloud Continuity (trial or paid)—it is not included in free pairing.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="proof-strip">
        <div><strong>1</strong><span>signed device identity</span></div>
        <div><strong>0</strong><span>shared private keys</span></div>
        <div><strong>90s</strong><span>execution lease</span></div>
        <div><strong>24/7</strong><span>control plane</span></div>
      </section>

      <section id="how-it-works" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">The failover path</p>
          <h2>Approve the call. Survive the lid close.</h2>
          <p>See the tool call, approve or deny it, then pick what happens if the Mac disappears.</p>
        </div>
        <FailoverPathDemo />
        <div className="steps-grid steps-grid-after-demo">
          <article><span>01</span><h3>Leash the call</h3><p>Hermes proposes a tool. You approve or deny from the web or phone before anything runs.</p></article>
          <article><span>02</span><h3>Run on your Mac while online</h3><p>Approved work stays on the paired machine under a 90-second exclusive lease.</p></article>
          <article><span>03</span><h3>Fail over only on your terms</h3><p>If the heartbeat drops: pause, ask first, or auto-continue with paid Cloud Continuity—never a silent double runner.</p></article>
        </div>
      </section>

      <section id="answers" className="section-block" aria-labelledby="answers-heading">
        <div className="section-heading">
          <p className="eyebrow">Direct answers</p>
          <h2 id="answers-heading">Hermes web control, without the guesswork.</h2>
        </div>
        <div className="steps-grid">
          {faqs.map((faq, index) => (
            <article key={faq.question}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="pricing-copy"><p className="eyebrow">Free control. Paid continuity.</p><h2>Chatting and approving is always free. Cloud Continuity is the one paid step.</h2><p>Web control of your own online Hermes machine stays free, always. Cloud Continuity lets an eligible task keep going in the cloud when your Mac can&apos;t.</p></div>
        <div className="price-grid">
          <article className="price-card">
            <div><span>Web Control</span><strong>$0<small>/month</small></strong></div>
            <ul>
              <li>Signed machine pairing</li>
              <li>Synced Hermes threads</li>
              <li>Local task continuation while online</li>
              <li>Pause or ask when offline</li>
            </ul>
            <LandingPricingCtaFree />
          </article>
          <article className="price-card featured">
            <div><span>Cloud Continuity</span><BillingPlan /></div>
            <ul>
              <li>Everything in Web Control</li>
              <li>100 cloud continuations every 30 days</li>
              <li>Automatic fenced failover</li>
              <li>14-day trial with 5 cloud runs</li>
            </ul>
            <LandingPricingCtaPaid />
          </article>
        </div>
      </section>

      <section id="mobile" className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Native apps</p>
          <h2>Same Hermes control, in your pocket.</h2>
          <p>The native app adds push-notified Leash approvals for when you&apos;re away from a browser. Install it alongside web control, or instead of it.</p>
        </div>
        <div className="hero-actions">
          <a
            href="/go/android"
            className="button button-secondary"
            data-funnel-event="play_store_click"
          >
            Get it on Google Play
          </a>
          <a
            href="/go/ios"
            className="button button-secondary"
            data-funnel-event="app_store_click"
          >
            Download on the App Store
          </a>
        </div>
      </section>

      <footer>
        <Link href="/" className="brand"><Mark /><span>ThumbGate <small>Hermes Web</small></span></Link>
        <p>Control your Hermes agents from anywhere — with a self-improving firewall built in.</p>
      </footer>
    </main>
  );
}
