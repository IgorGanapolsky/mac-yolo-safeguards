import styles from "./start-surfaces.module.css";

/**
 * Qoder download-page steal (qoder.com/download, 2026-08-18):
 * they lead with Mac/Windows/Linux installers + store badges + an
 * "always-on AI employee" card. ThumbGate.app is hosted Hermes in the
 * browser — no desktop binary. We steal the matrix and the identity
 * card, not a fake desktop installer or curl pipe.
 */
export function StartSurfaces() {
  return (
    <section id="start-surfaces" className={`section-block ${styles.wrap}`} data-testid="start-surfaces">
      <div className="section-heading">
        <p className="eyebrow">Get started</p>
        <h2>No desktop install. The VPS stays on.</h2>
        <p>
          Other agents make you download a Mac, Windows, or Linux app. Hosted Hermes opens
          in this browser. The agent runs on a fenced VPS so it does not die when the laptop
          sleeps.
        </p>
      </div>

      <div className={styles.grid}>
        <div className={styles.surfaces}>
          <article className={styles.primary} data-testid="start-browser">
            <p className={styles.kicker}>Browser</p>
            <h3>Start in this tab</h3>
            <p>No Mac/Windows/Linux package. Sign in and start the $10 hosted Hermes trial.</p>
            <a href="#pricing" className="button button-primary" data-funnel-event="cloud_continuity_click">
              Start hosted Hermes — $10/mo
            </a>
          </article>

          <article data-testid="start-always-on">
            <p className={styles.kicker}>Always-on</p>
            <h3>Your always-on agent</h3>
            <p>
              Included in the $10 plan. Work keeps a lease on a fenced VPS even when your
              computer is off. Approvals stay in thumbgate.app.
            </p>
          </article>

          <article data-testid="start-mobile">
            <p className={styles.kicker}>Phone · optional</p>
            <h3>You do not need a phone</h3>
            <p>
              Billing and approvals live in this browser. Hermes Mobile is optional, not a leash.
            </p>
            <p className={styles.stores}>
              <a href="/go/ios">App Store</a>
              <span aria-hidden="true"> · </span>
              <a href="/go/android">Google Play</a>
            </p>
          </article>
        </div>

        <aside className={styles.card} data-testid="agent-identity-card" aria-label="Hosted Hermes identity">
          <p className={styles.cardEyebrow}>Hosted agent</p>
          <h3>Hosted Hermes</h3>
          <p className={styles.role}>Gated coding agent</p>
          <ul className={styles.facts}>
            <li>
              <strong>Always on</strong>
              <span>Fenced VPS</span>
            </li>
            <li>
              <strong>Approvals</strong>
              <span>thumbgate.app</span>
            </li>
            <li>
              <strong>Price</strong>
              <span>$10/mo · 14-day trial</span>
            </li>
          </ul>
          <p className={styles.disclaimer}>No invented onboard days, triggers, or task counts.</p>
        </aside>
      </div>
    </section>
  );
}
