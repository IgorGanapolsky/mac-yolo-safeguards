"use client";

import { useEffect, useId, useMemo, useState } from "react";
import styles from "./failover-demo.module.css";

type Phase = "pending" | "denied" | "running" | "offline_choice" | "paused" | "ask" | "cloud";
type OfflinePolicy = "disabled" | "manual" | "auto";

const TOOL_CALL = {
  name: "Bash",
  summary: "npm run deploy -- --prod",
  detail: "Hermes wants to run this on your machine. You decide first.",
};

const OFFLINE_COPY: Record<OfflinePolicy, { label: string; blurb: string }> = {
  disabled: {
    label: "Wait until this Mac is back",
    blurb: "Work stays paused. No Continuity spend until the Mac is online again.",
  },
  manual: {
    label: "Ask me first",
    blurb: "Nothing runs on Continuity until you tap Continue. Safe default.",
  },
  auto: {
    label: "Keep going on Continuity",
    blurb: "A fenced Continuity VPS picks up the same chat thread automatically.",
  },
};

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "pending":
      return "Leash · pending approval";
    case "denied":
      return "Leash · denied";
    case "running":
      return "Running on your Mac";
    case "offline_choice":
      return "Mac offline · pick policy";
    case "paused":
      return "Paused · waiting for Mac";
    case "ask":
      return "Waiting for you · Continue on Continuity?";
    case "cloud":
      return "Continuity VPS · fenced lease";
    default:
      return "Demo";
  }
}

export function FailoverPathDemo() {
  const titleId = useId();
  const liveId = useId();
  const [phase, setPhase] = useState<Phase>("pending");
  const [policy, setPolicy] = useState<OfflinePolicy>("manual");
  const [autoplay, setAutoplay] = useState(false);

  const liveMessage = useMemo(() => {
    switch (phase) {
      case "pending":
        return "Demo ready. Approve or deny the sample tool call.";
      case "denied":
        return "Call denied. Hermes is told no and the command never runs.";
      case "running":
        return "Call approved. Hermes is executing on your Mac under a 90-second lease.";
      case "offline_choice":
        return "Mac closed. Choose how ThumbGate should handle the unfinished work.";
      case "paused":
        return "Work paused until the Mac heartbeats again. No cloud spend.";
      case "ask":
        return "You decide. Continuity does not start until you approve.";
      case "cloud":
        return "Continuity VPS took over with a fresh fenced lease. Same chat thread.";
      default:
        return "";
    }
  }, [phase]);

  useEffect(() => {
    if (!autoplay) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduceMotion ? 1800 : 1400;
    const steps: Phase[] = ["pending", "running", "offline_choice", "ask", "cloud"];
    let index = 0;
    // Only advance from the interval callback — never setState at effect body start
    // (eslint react-hooks/set-state-in-effect).
    const timer = window.setInterval(() => {
      index = (index + 1) % steps.length;
      const next = steps[index];
      if (next === "offline_choice" || next === "ask") setPolicy("manual");
      setPhase(next);
    }, delay);
    return () => window.clearInterval(timer);
  }, [autoplay]);

  function reset() {
    setAutoplay(false);
    setPolicy("manual");
    setPhase("pending");
  }

  function toggleAutoplay() {
    if (autoplay) {
      setAutoplay(false);
      return;
    }
    setPolicy("manual");
    setPhase("pending");
    setAutoplay(true);
  }

  function approveCall() {
    setAutoplay(false);
    setPhase("running");
  }

  function denyCall() {
    setAutoplay(false);
    setPhase("denied");
  }

  function closeLid() {
    setAutoplay(false);
    setPhase("offline_choice");
  }

  function applyPolicy(next: OfflinePolicy) {
    setAutoplay(false);
    setPolicy(next);
    if (next === "disabled") setPhase("paused");
    else if (next === "manual") setPhase("ask");
    else setPhase("cloud");
  }

  function continueInCloud() {
    setAutoplay(false);
    setPhase("cloud");
  }

  return (
    <section className={styles.demo} aria-labelledby={titleId}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Interactive demo · no real tools run</p>
          <h3 id={titleId}>Watch ThumbGate approve, deny, and fail over</h3>
          <p className={styles.lede}>
            Click the buttons. This is the product path: Leash decides the call, then “If Mac goes offline” decides who finishes the work.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.ghostButton}
            aria-pressed={autoplay}
            onClick={toggleAutoplay}
          >
            {autoplay ? "Stop autoplay" : "Autoplay path"}
          </button>
          <button type="button" className={styles.ghostButton} onClick={reset}>
            Reset demo
          </button>
        </div>
      </div>

      <div className={styles.stage}>
        <div className={styles.phone} aria-hidden="true">
          <div className={styles.phoneChrome}>
            <span />
            <span>Hermes Web</span>
            <span />
          </div>
          <div className={styles.phoneBody}>
            <div className={styles.statusRow}>
              <span className={`${styles.dot} ${phase === "denied" || phase === "paused" ? styles.dotWarn : styles.dotLive}`} />
              <strong>{phaseLabel(phase)}</strong>
            </div>

            <article className={styles.callCard}>
              <header>
                <span className={styles.toolPill}>{TOOL_CALL.name}</span>
                <span className={styles.leasePill}>
                  {phase === "cloud" ? "cloud lease · 90s" : phase === "running" || phase === "ask" || phase === "paused" || phase === "offline_choice" ? "local lease · 90s" : "awaiting you"}
                </span>
              </header>
              <code>{TOOL_CALL.summary}</code>
              <p>{TOOL_CALL.detail}</p>

              {phase === "pending" ? (
                <div className={styles.actionRow}>
                  <button type="button" className={styles.denyButton} onClick={denyCall}>
                    Deny call
                  </button>
                  <button type="button" className={styles.approveButton} onClick={approveCall}>
                    Approve call
                  </button>
                </div>
              ) : null}

              {phase === "denied" ? (
                <div className={`${styles.outcome} ${styles.denied}`}>
                  <strong>Denied</strong>
                  <p>Command never runs. Hermes is told no. Your Hermes work stays on the safe path.</p>
                  <button type="button" className={styles.ghostButton} onClick={reset}>
                    Try approve instead
                  </button>
                </div>
              ) : null}

              {phase === "running" ? (
                <div className={`${styles.outcome} ${styles.approved}`}>
                  <strong>Approved · Mac is running it</strong>
                  <p>One signed runner holds the lease. Now close the lid and see failover.</p>
                  <button type="button" className={styles.approveButton} onClick={closeLid}>
                    Close Mac lid →
                  </button>
                </div>
              ) : null}

              {phase === "offline_choice" || phase === "paused" || phase === "ask" || phase === "cloud" ? (
                <div className={styles.offlineBlock}>
                  <p className={styles.offlineBanner}>Mac went offline. What should happen next?</p>
                  <div className={styles.policyRow} role="group" aria-label="If Mac goes offline">
                    {(Object.keys(OFFLINE_COPY) as OfflinePolicy[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`${styles.policyButton} ${policy === key ? styles.policyActive : ""}`}
                        aria-pressed={policy === key}
                        onClick={() => applyPolicy(key)}
                      >
                        <strong>{OFFLINE_COPY[key].label}</strong>
                        <small>{OFFLINE_COPY[key].blurb}</small>
                      </button>
                    ))}
                  </div>

                  {phase === "paused" ? (
                    <div className={`${styles.outcome} ${styles.paused}`}>
                      <strong>offline_blocked</strong>
                      <p>No cloud runner starts. Work resumes when the Mac comes back online.</p>
                    </div>
                  ) : null}

                  {phase === "ask" ? (
                    <div className={`${styles.outcome} ${styles.ask}`}>
                      <strong>needs_failover</strong>
                      <p>ThumbGate waits for an explicit continue. Nothing spends until you approve.</p>
                      <button type="button" className={styles.approveButton} onClick={continueInCloud} aria-label="Continue this task on Continuity">
                        Continue on Continuity →
                      </button>
                    </div>
                  ) : null}

                  {phase === "cloud" ? (
                    <div className={`${styles.outcome} ${styles.cloud}`}>
                      <strong>cloud_pending → completed</strong>
                      <p>Fenced cloud runner claimed generation N+1. Stale Mac receipts cannot overwrite it.</p>
                      <button type="button" className={styles.ghostButton} onClick={reset}>
                        Run the demo again
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          </div>
        </div>

        <ol className={styles.legend} aria-label="Failover path legend">
          <li className={phase === "pending" || phase === "denied" || phase === "running" ? styles.legendActive : ""}>
            <span>01</span>
            <div>
              <strong>Leash gate</strong>
              <p>Approve runs the call on your Mac. Deny stops it cold.</p>
            </div>
          </li>
          <li className={phase === "running" ? styles.legendActive : ""}>
            <span>02</span>
            <div>
              <strong>Local execution</strong>
              <p>One signed Hermes machine holds a 90-second lease while online.</p>
            </div>
          </li>
          <li className={phase === "offline_choice" || phase === "paused" || phase === "ask" || phase === "cloud" ? styles.legendActive : ""}>
            <span>03</span>
            <div>
              <strong>If Mac goes offline</strong>
              <p>Wait for the Mac, ask you first, or keep going on Continuity.</p>
            </div>
          </li>
          <li className={phase === "cloud" ? styles.legendActive : ""}>
            <span>04</span>
            <div>
              <strong>Fenced failover</strong>
              <p>A cloud runner takes the next lease. No double-write, same thread.</p>
            </div>
          </li>
        </ol>
      </div>

      <p id={liveId} className={styles.live} aria-live="polite">
        {liveMessage}
      </p>
    </section>
  );
}
