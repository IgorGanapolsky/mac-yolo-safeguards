"use client";

import { useEffect, useId, useMemo, useState } from "react";
import styles from "./failover-demo.module.css";

type Phase = "pending" | "denied" | "running" | "offline_choice" | "paused" | "ask" | "cloud";
type OfflinePolicy = "disabled" | "manual" | "auto";
type ScenarioKey = "deploy" | "finance" | "branch";

interface Scenario {
  id: ScenarioKey;
  label: string;
  toolName: string;
  command: string;
  riskDescription: string;
  judgeRule: string;
}

const SCENARIOS: Record<ScenarioKey, Scenario> = {
  deploy: {
    id: "deploy",
    label: "Production Deploy",
    toolName: "Bash",
    command: "npm run deploy -- --prod",
    riskDescription: "Continuity wants to run this on the VPS. You decide in thumbgate.app.",
    judgeRule: "Rule: Sensitive production deploy requires explicit human gate.",
  },
  finance: {
    id: "finance",
    label: "Stripe Charge Gate",
    toolName: "StripeAPI",
    command: "stripe charges create --amount 50000 --currency usd",
    riskDescription: "Agent requested outbound $500.00 charge transaction.",
    judgeRule: "Rule: Outbound financial movement capped at $10.00 without interactive sign-off.",
  },
  branch: {
    id: "branch",
    label: "Git Force-Push Firewall",
    toolName: "Git",
    command: "git push origin main --force --no-verify",
    riskDescription: "Agent attempted destructive force-push to protected main branch.",
    judgeRule: "Rule: Protected branch history overwrite strictly blocked by LLM-as-a-Judge.",
  },
};

const OFFLINE_COPY: Record<OfflinePolicy, { label: string; blurb: string }> = {
  disabled: {
    label: "Pause until online",
    blurb: "Task freezes as offline_blocked. Nothing runs in the cloud.",
  },
  manual: {
    label: "Ask me first",
    blurb: "Task sits at needs_failover until you explicitly continue on cloud.",
  },
  auto: {
    label: "Auto cloud continuity",
    blurb: "A fenced cloud runner claims the 90s lease and keeps the same thread.",
  },
};

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "pending":
      return "thumbgate.app · pending approval";
    case "denied":
      return "thumbgate.app · denied";
    case "running":
      return "Running on Continuity VPS";
    case "offline_choice":
      return "Runner dropped · pick policy";
    case "paused":
      return "Paused · waiting for a runner";
    case "ask":
      return "Needs failover · waiting on you";
    case "cloud":
      return "Cloud continuity · fenced lease";
    default:
      return "Demo";
  }
}

export function FailoverPathDemo() {
  const titleId = useId();
  const liveId = useId();
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>("deploy");
  const [phase, setPhase] = useState<Phase>("pending");
  const [policy, setPolicy] = useState<OfflinePolicy>("manual");
  const [autoplay, setAutoplay] = useState(false);

  const scenario = SCENARIOS[scenarioKey];

  const liveMessage = useMemo(() => {
    switch (phase) {
      case "pending":
        return "Demo ready. Approve or deny the sample tool call.";
      case "denied":
        return "Call denied in thumbgate.app. The command never runs.";
      case "running":
        return "Call approved in thumbgate.app. Continuity is executing on a fenced VPS under a 90-second lease.";
      case "offline_choice":
        return "The VPS runner dropped. Choose how Continuity should handle the unfinished work.";
      case "paused":
        return "Work paused until a Continuity runner claims the next lease. No extra spend.";
      case "ask":
        return "You are asked before cloud. Approve failover only when you want it.";
      case "cloud":
        return "Cloud runner took over with a fresh fenced lease. Same chat thread.";
      default:
        return "";
    }
  }, [phase]);

  useEffect(() => {
    if (!autoplay) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduceMotion ? 1900 : 1500;
    const steps: Phase[] = ["pending", "running", "offline_choice", "ask", "cloud"];
    let index = 0;
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

  function selectScenario(key: ScenarioKey) {
    setAutoplay(false);
    setScenarioKey(key);
    setPhase("pending");
  }

  function approveCall() {
    setAutoplay(false);
    setPhase("running");
  }

  function denyCall() {
    setAutoplay(false);
    setPhase("denied");
  }

  function dropRunner() {
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
            Explore real agentic safety interdictions. Approve or deny in thumbgate.app, then Continuity decides how the VPS finishes the work.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.ghostButton}
            aria-pressed={autoplay}
            onClick={toggleAutoplay}
          >
            {autoplay ? "Stop autoplay" : "Autoplay simulation"}
          </button>
          <button type="button" className={styles.ghostButton} onClick={reset}>
            Reset demo
          </button>
        </div>
      </div>

      {/* Scenario Selector Tabs */}
      <div className={styles.scenarioBar} role="tablist" aria-label="Simulation Scenarios">
        {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={scenarioKey === key}
            className={`${styles.scenarioTab} ${scenarioKey === key ? styles.scenarioTabActive : ""}`}
            onClick={() => selectScenario(key)}
          >
            {SCENARIOS[key].label}
          </button>
        ))}
      </div>

      <div className={styles.stage}>
        {/* Terminal Sandbox Window */}
        <div className={styles.terminal} aria-hidden="true">
          <div className={styles.terminalHeader}>
            <div className={styles.windowControls}>
              <span className={styles.controlClose} />
              <span className={styles.controlMin} />
              <span className={styles.controlMax} />
            </div>
            <span className={styles.terminalTitle}>vps-runner@thumbgate-cloud-01: ~</span>
            <div className={styles.terminalBadge}>
              <span className={`${styles.dot} ${phase === "denied" || phase === "paused" ? styles.dotWarn : styles.dotLive}`} />
              <span>{phaseLabel(phase)}</span>
            </div>
          </div>

          <div className={styles.terminalBody}>
            {/* LLM-as-a-Judge Banner */}
            <div className={styles.judgeBanner}>
              <div className={styles.judgeHeader}>
                <span className={styles.shieldIcon}>🛡️</span>
                <strong>LLM-as-a-Judge Pre-Action Guardrail</strong>
                <span className={styles.judgeLatency}>&lt;45ms decision</span>
              </div>
              <p className={styles.judgeRuleText}>{scenario.judgeRule}</p>
            </div>

            <article className={styles.callCard}>
              <header>
                <span className={styles.toolPill}>{scenario.toolName}</span>
                <span className={styles.leasePill}>
                  {phase === "cloud" ? "VPS lease · 90s" : phase === "running" || phase === "ask" || phase === "paused" || phase === "offline_choice" ? "VPS lease · 90s" : "awaiting approval"}
                </span>
              </header>
              <code>
                <span className={styles.promptPrefix}>$ </span>
                {scenario.command}
              </code>
              <p>{scenario.riskDescription}</p>

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
                  <strong>Denied · Safety Interdiction Fired</strong>
                  <p>Command blocked before execution. Zero damage, zero exfiltration. Denied in thumbgate.app.</p>
                  <button type="button" className={styles.ghostButton} onClick={reset}>
                    Try approve instead
                  </button>
                </div>
              ) : null}

              {phase === "running" ? (
                <div className={`${styles.outcome} ${styles.approved}`}>
                  <strong>Approved · Fenced Continuity VPS Executing</strong>
                  <p>Isolated cloud container holding 90s renewable lease generation 1. Drop runner to test failover.</p>
                  <button type="button" className={styles.approveButton} onClick={dropRunner}>
                    Drop VPS runner →
                  </button>
                </div>
              ) : null}

              {phase === "offline_choice" || phase === "paused" || phase === "ask" || phase === "cloud" ? (
                <div className={styles.offlineBlock}>
                  <p className={styles.offlineBanner}>VPS runner dropped. Continuity failover policy decides next.</p>
                  <div className={styles.policyRow} role="group" aria-label="Offline policy">
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
                      <p>Execution paused cleanly. No replacement runner starts. Zero runaway compute spend.</p>
                    </div>
                  ) : null}

                  {phase === "ask" ? (
                    <div className={`${styles.outcome} ${styles.ask}`}>
                      <strong>needs_failover</strong>
                      <p>ThumbGate holds thread state at safe checkpoint. Awaiting explicit confirmation before cloud failover.</p>
                      <button type="button" className={styles.approveButton} onClick={continueInCloud} aria-label="Continue this task in cloud">
                        Continue in cloud →
                      </button>
                    </div>
                  ) : null}

                  {phase === "cloud" ? (
                    <div className={`${styles.outcome} ${styles.cloud}`}>
                      <strong>cloud_pending → completed</strong>
                      <p>Fenced cloud runner claimed lease generation 2. Zero state loss, deterministic receipt logged.</p>
                      <button type="button" className={styles.ghostButton} onClick={reset}>
                        Run another scenario
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          </div>
        </div>

        {/* Legend / Workflow Stages */}
        <ol className={styles.legend} aria-label="Failover path legend">
          <li className={phase === "pending" || phase === "denied" || phase === "running" ? styles.legendActive : ""}>
            <span>01</span>
            <div>
              <strong>Approve in thumbgate.app</strong>
              <p>Sensitive tool calls pause in the browser. You decide: Approve executes on the VPS, Deny blocks it cold.</p>
            </div>
          </li>
          <li className={phase === "running" ? styles.legendActive : ""}>
            <span>02</span>
            <div>
              <strong>Fenced VPS execution</strong>
              <p>Isolated Cloud Sandbox runner executes with a 90-second renewable lease and audit receipts.</p>
            </div>
          </li>
          <li className={phase === "offline_choice" || phase === "paused" || phase === "ask" || phase === "cloud" ? styles.legendActive : ""}>
            <span>03</span>
            <div>
              <strong>Failover policy</strong>
              <p>Pause, ask, or auto-continue. Cloud execution activates only under your configured organization policy.</p>
            </div>
          </li>
          <li className={phase === "cloud" ? styles.legendActive : ""}>
            <span>04</span>
            <div>
              <strong>Fenced failover</strong>
              <p>Cloud runner takes generation N+1 lease. Same conversation thread, zero duplicate side-effects.</p>
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
