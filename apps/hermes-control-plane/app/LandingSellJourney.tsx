"use client";

import { useState } from "react";
import styles from "./landing-sell.module.css";

const INSTALLER =
  "curl -fsSL https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/saas/install-connector.sh | bash";

type StepId = "install" | "approve" | "offline";
type Policy = "pause" | "ask" | "auto";

const STEPS: Array<{
  id: StepId;
  title: string;
  blurb: string;
}> = [
  {
    id: "install",
    title: "Run one installer",
    blurb: "Connector dials out over HTTPS. No inbound ports. No port-forwarding drama.",
  },
  {
    id: "approve",
    title: "Approve the Mac",
    blurb: "Sign in once. Confirm the short code. Your private key never leaves the machine.",
  },
  {
    id: "offline",
    title: "Pick offline behavior",
    blurb: "When the lid closes: pause, ask first, or keep going on Continuity (VPS).",
  },
];

const POLICIES: Array<{ id: Policy; label: string; detail: string; sell?: string }> = [
  {
    id: "pause",
    label: "Pause",
    detail: "Free. Work waits until the Mac is back.",
  },
  {
    id: "ask",
    label: "Ask me",
    detail: "You approve before any cloud run.",
  },
  {
    id: "auto",
    label: "Continuity",
    detail: "Paid VPS keeps eligible threads alive.",
    sell: "This is the product people buy.",
  },
];

export function LandingSellJourney() {
  const [active, setActive] = useState<StepId>("install");
  const [copied, setCopied] = useState(false);
  const [policy, setPolicy] = useState<Policy>("auto");

  async function copyInstaller() {
    try {
      await navigator.clipboard.writeText(INSTALLER);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.pairJourney}>
      {STEPS.map((step, index) => {
        const open = active === step.id;
        return (
          <article
            key={step.id}
            className={`${styles.stepCard} ${open ? styles.stepCardActive : ""}`}
          >
            <button
              type="button"
              className={styles.stepHeader}
              aria-expanded={open}
              onClick={() => setActive(step.id)}
            >
              <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.stepBody}>
                <h3>{step.title}</h3>
                <p>{step.blurb}</p>
              </div>
            </button>
            {open ? (
              <div className={styles.stepDetail}>
                {step.id === "install" ? (
                  <>
                    <code>{INSTALLER}</code>
                    <div className={styles.stepActions}>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => void copyInstaller()}
                      >
                        {copied ? "Copied ✓" : "Copy installer"}
                      </button>
                      <a
                        href="/api/auth/login"
                        className="button button-primary button-small"
                        data-funnel-event="sign_in_click"
                      >
                        Sign in to approve →
                      </a>
                    </div>
                  </>
                ) : null}
                {step.id === "approve" ? (
                  <div className={styles.stepActions}>
                    <a
                      href="/api/auth/login"
                      className="button button-primary button-small"
                      data-funnel-event="sign_in_click"
                    >
                      Continue with Google / Apple →
                    </a>
                    <a href="/dashboard" className="button button-ghost button-small">
                      I already signed in
                    </a>
                  </div>
                ) : null}
                {step.id === "offline" ? (
                  <>
                    <div className={styles.policyGrid} role="radiogroup" aria-label="Offline behavior">
                      {POLICIES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="radio"
                          aria-checked={policy === item.id}
                          className={`${styles.policyBtn} ${policy === item.id ? styles.policyBtnActive : ""}`}
                          onClick={() => setPolicy(item.id)}
                        >
                          <strong>{item.label}</strong>
                          <span>{item.detail}</span>
                          {item.sell ? <span>{item.sell}</span> : null}
                        </button>
                      ))}
                    </div>
                    <div className={styles.stepActions}>
                      {policy === "auto" ? (
                        <a
                          href="#pricing"
                          className="button button-primary button-small"
                          data-funnel-event="cloud_continuity_click"
                        >
                          Get Continuity →
                        </a>
                      ) : (
                        <a
                          href="/api/auth/login"
                          className="button button-primary button-small"
                          data-funnel-event="free_control_click"
                        >
                          Start free web control →
                        </a>
                      )}
                      <a href="#how-it-works" className="button button-ghost button-small">
                        Watch the live demo
                      </a>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function LandingSellGrid() {
  return (
    <div className={styles.sellGrid} aria-label="Why ThumbGate">
      <a className={styles.sellCard} href="#how-it-works">
        <kbd>CLICK · DEMO</kbd>
        <strong>Approve. Deny. Fail over.</strong>
        <p>Interactive product path — not a screenshot. Tap the demo and feel the Leash.</p>
        <em>Try it below →</em>
      </a>
      <a className={styles.sellCard} href="#pricing">
        <kbd>FREE → PAID</kbd>
        <strong>$0 while your Mac is online.</strong>
        <p>Pay only for Continuity when the machine disappears and work must keep going.</p>
        <em>See pricing →</em>
      </a>
      <a className={styles.sellCard} href="#mobile">
        <kbd>PHONE + WEB</kbd>
        <strong>Same control on your phone.</strong>
        <p>Hermes Mobile for push approvals when you are away from the browser.</p>
        <em>Get the apps →</em>
      </a>
    </div>
  );
}

export function LandingFaq({
  items,
}: {
  items: ReadonlyArray<{ question: string; answer: string }>;
}) {
  return (
    <div className={styles.faqList}>
      {items.map((item, index) => (
        <details key={item.question} className={styles.faqItem} open={index === 0}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function LandingFinalCta() {
  return (
    <section className={styles.finalCta} aria-label="Get started">
      <div>
        <p className="eyebrow">Ship the remote control layer</p>
        <h2>Your Hermes agents. Browser. Phone. Offline-safe.</h2>
        <p>
          Pair a Mac in minutes. Chat from the web. Keep eligible work alive on Continuity when the lid closes.
          Free to start — pay only for cloud failover.
        </p>
      </div>
      <div className={styles.finalActions}>
        <a href="/api/auth/login" className="button button-primary" data-funnel-event="sign_in_click">
          Start free →
        </a>
        <a href="#pricing" className="button button-secondary" data-funnel-event="cloud_continuity_click">
          Continuity pricing
        </a>
      </div>
    </section>
  );
}

export function LandingStickyCta() {
  return (
    <div className={styles.stickyCta} role="region" aria-label="Quick start">
      <p>
        <strong>Ready in one installer.</strong> Free web control. Continuity when you need it.
      </p>
      <a href="/api/auth/login" className="button button-primary button-small" data-funnel-event="sign_in_click">
        Sign in free →
      </a>
      <a href="#pair" className="button button-ghost button-small">
        Pair Mac
      </a>
    </div>
  );
}
