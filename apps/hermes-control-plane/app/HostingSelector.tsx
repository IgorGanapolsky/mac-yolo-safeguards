"use client";

import { useState } from "react";
import styles from "./hosting-selector.module.css";

export type HostingMode = "cloud" | "local";

export function HostingSelector() {
  const [mode, setMode] = useState<HostingMode>("cloud");
  const [help, setHelp] = useState(false);

  return (
    <section id="hosting" className={`section-block ${styles.wrap}`} data-testid="hosting-selector">
      <div className={styles.header}>
        <h2>Hosting</h2>
        <p>
          Choose where you want your assistant to live.{" "}
          <button type="button" className={styles.help} onClick={() => setHelp((open) => !open)}>
            Need help deciding?
          </button>
        </p>
      </div>

      {help ? (
        <p className={styles.helpBox} data-testid="hosting-help">
          <strong>ThumbGate Cloud</strong> is hosted Hermes on a fenced VPS — always on, even
          when your computer is off. That is the $10/mo offer. <strong>Local</strong> runs on
          your machine at $0. Local dies when the laptop sleeps. Approvals stay in this browser.
          This is not a second SKU.
        </p>
      ) : null}

      <div className={styles.cards} role="radiogroup" aria-label="Hosting">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "cloud"}
          className={mode === "cloud" ? styles.cardSelected : styles.card}
          onClick={() => setMode("cloud")}
        >
          <span className={styles.icon} aria-hidden="true">
            ☁
          </span>
          <span className={styles.copy}>
            <strong>ThumbGate Cloud</strong>
            <span>
              Always on, 24/7, even when your computer is off. Runs on a fenced VPS. Approvals
              stay in this browser.
            </span>
          </span>
          <span className={styles.radio} aria-hidden="true" />
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={mode === "local"}
          className={mode === "local" ? styles.cardSelected : styles.card}
          onClick={() => setMode("local")}
        >
          <span className={styles.icon} aria-hidden="true">
            ⌂
          </span>
          <span className={styles.copy}>
            <strong>Local</strong>
            <span>Runs directly on your machine. Your data never leaves your computer.</span>
          </span>
          <span className={styles.radio} aria-hidden="true" />
        </button>
      </div>

      {mode === "cloud" ? (
        <a
          href="#pricing"
          className={`button button-primary ${styles.continue}`}
          data-funnel-event="cloud_continuity_click"
          data-testid="hosting-continue-cloud"
        >
          Continue
        </a>
      ) : (
        <p className={styles.localNote} data-testid="hosting-continue-local">
          Local is your Mac. It is not the $10 hosted offer. Work stops when the laptop sleeps.
          Approvals for hosted runs still happen in thumbgate.app.
        </p>
      )}
    </section>
  );
}
