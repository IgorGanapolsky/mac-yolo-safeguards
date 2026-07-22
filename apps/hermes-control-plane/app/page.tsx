import Link from "next/link";
import { BillingPlan } from "./BillingPlan";
import { FunnelSignals } from "./FunnelSignals";
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
  const faqs = [
    {
      question: "What is ThumbGate?",
      answer: "ThumbGate is the web control and safety layer for Hermes. It lets an authenticated user see and continue Hermes chats while the user's own Mac remains the default executor.",
    },
    {
      question: "What happens when the paired Mac goes offline?",
      answer: "Free Web Control pauses or asks. A trial or paid Cloud Continuity plan can hand an eligible task to a fenced cloud runner with a renewable 90-second lease.",
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
        description: "Hermes chats and Leash controls on the web, with signed machine pairing and fenced cloud continuation.",
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
          <p className="eyebrow"><span className="live-dot" /> Hermes-native. Web + mobile.</p>
          <h1>Your agent, wherever you are.<br /><span>Even when your Mac isn&apos;t.</span></h1>
          <p className="hero-lede">Chat with Hermes, approve what it&apos;s about to run, and watch it work—from your phone or any browser. Free while your Mac is on. Turn on Cloud Continuity and it keeps going even after you close the lid.</p>
          <LandingAuthHero />
          <p className="signin-note">Hermes Web by ThumbGate. Sign in with email or Google; enterprise SSO is discovered from a verified work email, and additional social providers appear only after they are configured.</p>
          <div className="trust-row"><span>No inbound ports</span><span>Private-key pairing</span><span>Cloud only when enabled</span></div>
        </div>

        <nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">
          <LandingAuthPanel />
        </nav>
      </section>

      <section id="pair" className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">THREE-STEP PAIRING</p>
          <h2>Pair a Mac that already runs Hermes.</h2>
          <p>
            The connector dials out over HTTPS, creates a device key on the machine, and keeps your local gateway credential local—it is never uploaded.
            Chats appear after you sign in, approve the device, and the connector syncs sessions from Hermes on that Mac.
          </p>
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
        <div className="section-heading"><p className="eyebrow">The safe handoff</p><h2>One thread. One executor. Always recoverable.</h2></div>
        <div className="steps-grid">
          <article><span>01</span><h3>Pair without a gateway secret</h3><p>The connector creates a device key on the machine. You approve its short code and fingerprint from the signed-in dashboard.</p></article>
          <article><span>02</span><h3>Route by live heartbeat</h3><p>Online tasks stay on your Hermes machine. Offline, free accounts pause or ask; automatic fenced cloud failover needs Cloud Continuity.</p></article>
          <article><span>03</span><h3>Fence every execution</h3><p>Local and cloud workers claim expiring generations. A stale worker cannot overwrite the result after another runner takes over.</p></article>
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
        <div className="pricing-copy"><p className="eyebrow">Free control. Paid continuity.</p><h2>You don&apos;t pay to chat. You pay so your agent never has to wait for you.</h2><p>Web control of your own online Hermes machine stays free, always. Cloud Continuity is the only paid step—it keeps your agent running when your Mac can&apos;t.</p></div>
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

      <footer>
        <Link href="/" className="brand"><Mark /><span>ThumbGate <small>Hermes Web</small></span></Link>
        <p>Your Hermes workspace, wherever you are.</p>
        <nav className="footer-app-links" aria-label="Get the mobile app">
          <a href="https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id6786778037">Hermes Mobile on the App Store</a>
          <a href="/get-android">Hermes Mobile on Google Play</a>
        </nav>
      </footer>
    </main>
  );
}
