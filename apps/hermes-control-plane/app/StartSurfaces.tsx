import { StoreBadgeRow } from "./StoreBadges";
import styles from "./start-surfaces.module.css";

/**
 * Qoder download-page steal (qoder.com/download, 2026-08-18):
 * they lead with store badges + Mac/Windows/Linux installers + a named
 * always-on employee card. ThumbGate.app is hosted Hermes in the
 * browser — no desktop binary. We steal the two-panel matrix and the
 * identity card, not a fake installer or invented task counts.
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

      <div className={styles.stack}>
        <article className={styles.panel} data-testid="start-mobile">
          <div>
            <p className={styles.kicker}>Phone · optional</p>
            <h3>You do not need a phone</h3>
            <p>
              Billing and approvals live in this browser. Hermes Mobile is optional, not a leash.
              You can manage the $10 hosted agent from the store apps if you want — you do not
              have to.
            </p>
            <StoreBadgeRow aria-label="Optional Hermes Mobile listings" />
          </div>
        </article>

        <article className={styles.panel} data-testid="start-always-on">
          <div className={styles.wakeCopy}>
            <p className={styles.kicker}>Always-on</p>
            <h3>Your always-on agent</h3>
            <p>
              Included in the $10 plan. Work keeps a lease on a fenced VPS even when your
              computer is off. Approvals stay in thumbgate.app.
            </p>
            <ul className={styles.osInvert} data-testid="os-invert">
              <li>
                <strong>macOS</strong>
                <span>No desktop app. Start in this tab.</span>
              </li>
              <li>
                <strong>Windows</strong>
                <span>No installer. Start in this tab.</span>
              </li>
              <li>
                <strong>Linux</strong>
                <span>No install script. Start in this tab.</span>
              </li>
            </ul>
            <a
              href="#pricing"
              className="button button-primary"
              data-funnel-event="cloud_continuity_click"
              data-testid="start-browser"
            >
              Start hosted Hermes — $10/mo
            </a>
          </div>

          <aside className={styles.card} data-testid="agent-identity-card" aria-label="Hosted Hermes identity">
            <p className={styles.cardEyebrow}>Hosted agent</p>
            <div className={styles.identity}>
              <span className={styles.avatar} aria-hidden="true">H</span>
              <div>
                <h3>Hosted Hermes</h3>
                <p className={styles.role}>Gated coding agent</p>
                <p className={styles.status}>Always on</p>
              </div>
            </div>
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
        </article>
      </div>
    </section>
  );
}
